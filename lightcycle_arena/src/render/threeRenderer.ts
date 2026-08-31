// src/render/threeRenderer.ts
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { GridConfig } from "../utils/gridConfig";
import type { LatticeMatrix } from "../utils/latticeHelpers";
import type { GameRenderer, PlayerRenderView, RenderFrame } from "./types";
import type { TrailRunState } from "./trailGeometry";
import {
  clipTipBehindBike,
  decideTrailAction,
  spanBetween,
} from "./trailGeometry";
import {
  WORLD_CELL_SIZE,
  directionToYaw,
  latticeToWorldX,
  latticeToWorldZ,
  lerp,
  shortestAngleDelta,
  smoothingFactor,
} from "./worldMapping";

const BACKGROUND_COLOR = 0x04060d;

/*
 * A chase camera rides directly over its own wall, so the only face of it you
 * ever see is the top. Thin is what turns that into a ribbon running away
 * behind you rather than a stripe painted on the floor, and the rim has to
 * carry itself on a phone where there is no bloom to help it.
 *
 * The height is bounded by something else entirely: the wall between the camera
 * and the bike will hide the bike if it is tall enough to cross that line of
 * sight. From this camera, anything past about 1.4 does.
 */
const TRAIL_HEIGHT = 1.25;
const TRAIL_THICKNESS = 0.17;
const TRAIL_RIM_HEIGHT = 0.1;
const TRAIL_RIM_THICKNESS = 0.23;
/**
 * The wall is laid a bit behind the rear wheel. Without this gap the bike sits
 * inside its own glow and the chase camera can't read its silhouette.
 */
const TRAIL_TIP_GAP = 1.4;

const ARENA_WALL_HEIGHT = 11;
const ARENA_WALL_THICKNESS = 1.4;

/**
 * Vertical FOV tuned for a landscape view, plus the aspect it was tuned at.
 * On taller viewports (phones) the vertical FOV is widened to hold the
 * horizontal one roughly constant, so the wall ahead doesn't fill the frame.
 */
const BASE_VERTICAL_FOV_DEGREES = 58;
const BASE_ASPECT = 16 / 9;
const MAXIMUM_VERTICAL_FOV_DEGREES = 76;

const CAMERA_BACK_DISTANCE = 4.8;
/** High enough to see the bike over the wall it is laying. */
const CAMERA_HEIGHT = 2.9;
const CAMERA_LOOK_AHEAD = 11;
const CAMERA_LOOK_HEIGHT = 1;
/**
 * A phone gets a much wider vertical lens, and most of what that buys is empty
 * sky. Dropping the point the camera looks at spends it on floor instead.
 */
const LOOK_DROP_PER_EXTRA_FOV_DEGREE = 0.02;

const CAMERA_FOLLOW_RESPONSIVENESS = 11;
const BIKE_TURN_RESPONSIVENESS = 16;

/** Name tags: the rival's stays up, the player's is a reminder that fades. */
const LABEL_HEIGHT = 2.1;
const LABEL_SCREEN_SCALE = 0.055;
const LABEL_MINIMUM_SCALE = 0.55;
const LABEL_MAXIMUM_SCALE = 2.6;
const LABEL_BRIEF_SECONDS = 3.2;
const LABEL_FADE_SECONDS = 0.8;

/** Lean into the turn: degrees of roll per radian-per-second of yaw. */
const BIKE_ROLL_PER_TURN_RATE = 0.22;
const BIKE_MAXIMUM_ROLL = 0.42;
const BIKE_ROLL_RESPONSIVENESS = 9;

/** Extra vertical FOV at the fastest level, which reads as speed. */
const FOV_SPEED_KICK_DEGREES = 5;

/** Frame budget before the 3D view starts trading resolution for smoothness. */
const FRAME_BUDGET_MILLISECONDS = 21;
const FRAME_COMFORT_MILLISECONDS = 13;
const RESOLUTION_STEP = 0.25;
const MINIMUM_PIXEL_RATIO = 0.75;
const RESOLUTION_REVIEW_SECONDS = 1.5;

/**
 * Where the wheels sit in the hull's own coordinates: length along X with the
 * nose at negative X, height along Y with the ground at zero. The rear wheel is
 * the larger of the two, as it is on the film's bike.
 */
const WHEELS = [
  { x: -0.6, y: 0.36, radius: 0.34 },
  { x: 0.66, y: 0.42, radius: 0.4 },
] as const;

const BIKE_WIDTH = 0.32;

const DEBRIS_PER_CRASH = 18;
const DEBRIS_GRAVITY = 11;
const CAMERA_SHAKE_ON_CRASH = 0.55;
const CAMERA_SHAKE_DECAY = 3.4;

export interface ThreeRendererOptions {
  /** Bloom is the expensive part; low-end devices turn it off. */
  enableBloom?: boolean;
  /**
   * Called when the browser takes the WebGL context away (GPU reset, a phone
   * reclaiming memory) and when it hands it back. The app rebuilds the renderer
   * on restore, since a dropped context takes every buffer with it.
   */
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

/** A piece of a wrecked bike, thrown out on impact. */
interface DebrisPiece {
  mesh: Mesh;
  velocity: Vector3;
  remainingLife: number;
}

interface PlayerVisual {
  bike: Group;
  panelMaterial: MeshStandardMaterial;
  rimMaterial: MeshStandardMaterial;
  tintedMaterials: MeshStandardMaterial[];
  bikeLight: PointLight;
  label: Sprite;
  labelMaterial: SpriteMaterial;
  /** What the tag currently says, so it is only redrawn when it changes. */
  labelText: string;
  colorHex: string;
  trailMeshes: Mesh[];
  activeRun: (TrailRunState & { panel: Mesh; rim: Mesh }) | null;
  /** Set when the wall meshes no longer match the lattice and must be redone. */
  needsTrailRebuild: boolean;
  wasAlive: boolean;
  roll: number;
}

/**
 * Cockpit view of the same lattice game: walls are extruded boxes, the head is
 * a lightcycle, and a chase camera rides behind player one.
 *
 * The renderer owns no game state. Every frame it is handed the lattice view
 * and reconciles its meshes against it.
 */
export function createThreeRenderer(
  canvas: HTMLCanvasElement,
  grid: GridConfig,
  options: ThreeRendererOptions = {}
): GameRenderer {
  const enableBloom = options.enableBloom ?? true;

  const arenaWidth = grid.columns * WORLD_CELL_SIZE;
  const arenaDepth = grid.rows * WORLD_CELL_SIZE;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: enableBloom,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  let contextLost = false;

  function handleContextLost(event: Event): void {
    // Without preventDefault the browser never bothers to restore it.
    event.preventDefault();
    contextLost = true;
    options.onContextLost?.();
  }
  function handleContextRestored(): void {
    contextLost = false;
    options.onContextRestored?.();
  }

  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.addEventListener("webglcontextrestored", handleContextRestored);

  const scene = new Scene();
  scene.background = new Color(BACKGROUND_COLOR);
  scene.fog = new Fog(BACKGROUND_COLOR, arenaDepth * 0.25, arenaDepth * 1.15);

  const camera = new PerspectiveCamera(
    BASE_VERTICAL_FOV_DEGREES,
    BASE_ASPECT,
    0.1,
    arenaDepth * 3
  );
  camera.position.set(0, CAMERA_HEIGHT, arenaDepth / 2);

  // Geometries shared by every wall and bike, disposed once at the end.
  const unitBoxGeometry = new BoxGeometry(1, 1, 1);
  const ownedGeometries: BufferGeometry[] = [unitBoxGeometry];
  const ownedMaterials: Material[] = [];

  function trackGeometry<T extends BufferGeometry>(geometry: T): T {
    ownedGeometries.push(geometry);
    return geometry;
  }
  function trackMaterial<T extends Material>(material: T): T {
    ownedMaterials.push(material);
    return material;
  }

  buildLighting();
  buildFloor();
  buildArenaWalls();

  // Motion the player never asked for is the first thing to drop when they
  // have said they would rather not have it.
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const maximumPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  let currentPixelRatio = maximumPixelRatio;
  let frameTimeAverage = 16;
  let secondsSinceResolutionReview = 0;
  let roundElapsedSeconds = 0;
  let appliedFovKick = -1;

  const playerVisuals: PlayerVisual[] = [];
  const debris: DebrisPiece[] = [];
  const cameraAnchor = new Vector3(0, CAMERA_HEIGHT, arenaDepth / 2);
  const cameraLookTarget = new Vector3(0, CAMERA_LOOK_HEIGHT, 0);
  let cameraShake = 0;
  let shouldSnapCamera = true;
  let lastFrameTimestamp = 0;

  const composer = enableBloom ? buildComposer() : null;

  function buildLighting(): void {
    scene.add(new AmbientLight(0x4466aa, 1.1));
    scene.add(new HemisphereLight(0x2a4c8f, 0x050508, 1.4));
  }

  function buildFloor(): void {
    const floor = new Mesh(
      trackGeometry(new PlaneGeometry(arenaWidth, arenaDepth)),
      trackMaterial(
        new MeshStandardMaterial({
          color: 0x05070f,
          roughness: 0.28,
          metalness: 0.85,
        })
      )
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Neon grid, lifted a hair off the floor to avoid z-fighting.
    const halfWidth = arenaWidth / 2;
    const halfDepth = arenaDepth / 2;
    const linePositions: number[] = [];

    for (let column = 0; column <= grid.columns; column += 1) {
      const x = -halfWidth + column * WORLD_CELL_SIZE;
      linePositions.push(x, 0.02, -halfDepth, x, 0.02, halfDepth);
    }
    for (let row = 0; row <= grid.rows; row += 1) {
      const z = -halfDepth + row * WORLD_CELL_SIZE;
      linePositions.push(-halfWidth, 0.02, z, halfWidth, 0.02, z);
    }

    const lineGeometry = trackGeometry(new BufferGeometry());
    lineGeometry.setAttribute("position", new Float32BufferAttribute(linePositions, 3));
    scene.add(
      new LineSegments(
        lineGeometry,
        trackMaterial(
          new LineBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.4 })
        )
      )
    );
  }

  function buildArenaWalls(): void {
    const halfWidth = arenaWidth / 2;
    const halfDepth = arenaDepth / 2;
    const outerOffset = ARENA_WALL_THICKNESS / 2;

    const wallMaterial = trackMaterial(
      new MeshStandardMaterial({
        color: 0x080b18,
        emissive: 0x0b1233,
        emissiveIntensity: 1,
        roughness: 0.55,
        metalness: 0.45,
      })
    );
    const baseStripMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x001018, emissive: 0x00d8ff, emissiveIntensity: 1.8 })
    );
    const topStripMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x140018, emissive: 0xb02bff, emissiveIntensity: 1.6 })
    );

    const sides: Array<{ x: number; z: number; width: number; depth: number }> = [
      { x: 0, z: -halfDepth - outerOffset, width: arenaWidth + ARENA_WALL_THICKNESS * 2, depth: ARENA_WALL_THICKNESS },
      { x: 0, z: halfDepth + outerOffset, width: arenaWidth + ARENA_WALL_THICKNESS * 2, depth: ARENA_WALL_THICKNESS },
      { x: -halfWidth - outerOffset, z: 0, width: ARENA_WALL_THICKNESS, depth: arenaDepth + ARENA_WALL_THICKNESS * 2 },
      { x: halfWidth + outerOffset, z: 0, width: ARENA_WALL_THICKNESS, depth: arenaDepth + ARENA_WALL_THICKNESS * 2 },
    ];

    for (const side of sides) {
      const wall = new Mesh(unitBoxGeometry, wallMaterial);
      wall.scale.set(side.width, ARENA_WALL_HEIGHT, side.depth);
      wall.position.set(side.x, ARENA_WALL_HEIGHT / 2, side.z);
      scene.add(wall);

      const baseStrip = new Mesh(unitBoxGeometry, baseStripMaterial);
      baseStrip.scale.set(side.width * 0.995, 0.4, side.depth * 0.995);
      baseStrip.position.set(side.x, 0.2, side.z);
      scene.add(baseStrip);

      const topStrip = new Mesh(unitBoxGeometry, topStripMaterial);
      topStrip.scale.set(side.width * 0.995, 0.3, side.depth * 0.995);
      topStrip.position.set(side.x, ARENA_WALL_HEIGHT, side.z);
      scene.add(topStrip);
    }
  }

  function buildComposer(): EffectComposer {
    const effectComposer = new EffectComposer(renderer);
    effectComposer.addPass(new RenderPass(scene, camera));
    effectComposer.addPass(new UnrealBloomPass(new Vector2(1, 1), 0.35, 0.5, 0.65));
    effectComposer.addPass(new OutputPass());
    return effectComposer;
  }

  /**
   * Draw a name onto a canvas and hand it back as a sprite texture. Sprites
   * always face the camera, which is exactly what a name tag wants to do.
   */
  function createLabelTexture(text: string, color: string): CanvasTexture {
    const scale = 2; // drawn oversized so it stays crisp up close
    const fontSize = 44 * scale;
    const canvasElement = document.createElement("canvas");
    const context = canvasElement.getContext("2d");

    const font = `700 ${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
    if (context) {
      context.font = font;
      canvasElement.width = Math.ceil(context.measureText(text).width) + 40 * scale;
      canvasElement.height = Math.ceil(fontSize * 1.6);

      // Setting the size clears the canvas, so the font has to be set again.
      context.font = font;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.shadowColor = color;
      context.shadowBlur = 18 * scale;
      context.fillStyle = color;
      context.fillText(text, canvasElement.width / 2, canvasElement.height / 2);
      context.shadowBlur = 0;
      context.fillStyle = "rgba(255,255,255,0.92)";
      context.fillText(text, canvasElement.width / 2, canvasElement.height / 2);
    }

    const texture = new CanvasTexture(canvasElement);
    texture.needsUpdate = true;
    return texture;
  }

  function applyLabel(visual: PlayerVisual, text: string, color: string): void {
    visual.labelMaterial.map?.dispose();
    const texture = createLabelTexture(text, color);
    visual.labelMaterial.map = texture;
    visual.labelMaterial.needsUpdate = true;
    visual.labelText = text;

    const image = texture.image as HTMLCanvasElement;
    const aspect = image.height > 0 ? image.width / image.height : 4;
    visual.label.userData.aspect = aspect;
  }

  /**
   * A lightcycle built out of primitives: long tapered hull, canopy over the
   * rider, hub-less wheels lit from the inside. Swapping this for a loaded GLTF
   * later only touches this function.
   */
  interface BikeParts {
    group: Group;
    /** Everything that wears the rider's colour and is repainted per level. */
    tintedMaterials: MeshStandardMaterial[];
    light: PointLight;
  }

  /**
   * The side view of a 1982 lightcycle, drawn once and extruded.
   *
   * The original was built out of plain solids — that is why it looks the way
   * it does — so a hand-drawn profile with two round holes for the wheels gets
   * closer to it than any amount of bevelled detail would. Length runs along
   * the shape's X, height along its Y, and the whole thing is turned to face
   * down the bike's own -Z afterwards.
   */
  function buildHullShape(): Shape {
    const hull = new Shape();

    hull.moveTo(-1.42, 0.26); // the nose reaches well past the front wheel
    hull.lineTo(-1.3, 0.44);
    hull.quadraticCurveTo(-1.02, 0.76, -0.6, 0.76); // tight over the front wheel
    hull.quadraticCurveTo(-0.32, 0.76, -0.2, 0.62);
    hull.lineTo(0.16, 0.6); // the deck runs flat and high between the wheels
    hull.quadraticCurveTo(0.34, 0.64, 0.44, 0.82);
    hull.quadraticCurveTo(0.66, 0.94, 0.92, 0.84); // and over the rear one
    hull.quadraticCurveTo(1.12, 0.74, 1.16, 0.46);
    hull.lineTo(1.1, 0.16); // tail
    hull.quadraticCurveTo(1.06, -0.03, 0.86, -0.03);
    hull.lineTo(-0.86, -0.03); // a skirt close to the floor the whole length
    hull.quadraticCurveTo(-1.16, -0.03, -1.3, 0.12);
    hull.closePath();

    // The wheels show through the body rather than hanging off it. The holes
    // have to sit clear of the outline: an opening that crosses it leaves the
    // extruded shape undefined, which is exactly how this started out as a slab.
    for (const wheel of WHEELS) {
      const opening = new Path();
      opening.absarc(wheel.x, wheel.y, wheel.radius + 0.03, 0, Math.PI * 2, true);
      hull.holes.push(opening);
    }

    // The notch under the deck, the cut-out that keeps the middle from reading
    // as a slab between two rings.
    const notch = new Path();
    notch.moveTo(-0.22, 0.1);
    notch.lineTo(0.22, 0.1);
    notch.lineTo(0.22, 0.46);
    notch.lineTo(-0.22, 0.46);
    notch.closePath();
    hull.holes.push(notch);

    return hull;
  }

  function buildBike(color: Color): BikeParts {
    const bike = new Group();
    // Yaw first, then roll about the bike's own length, so leaning into a turn
    // tips the rider rather than swinging the whole bike sideways.
    bike.rotation.order = "YZX";

    const bodyMaterial = trackMaterial(
      new MeshStandardMaterial({
        color,
        // Just enough of its own light to read against a dark floor; the film's
        // bikes are painted, not lit.
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.38,
        metalness: 0.25,
      })
    );
    const trimMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0xd6e2f4, roughness: 0.42, metalness: 0.4 })
    );
    const darkMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x05070e, roughness: 0.45, metalness: 0.5 })
    );
    // The hub is the one part that glows, and it is what you pick out at range.
    // A band seen from inside as well as out, so it needs both faces.
    const fenderMaterial = trackMaterial(
      new MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        roughness: 0.38,
        metalness: 0.25,
        side: DoubleSide,
      })
    );
    const hubMaterial = trackMaterial(
      new MeshStandardMaterial({
        color: 0x0a0c14,
        emissive: color,
        emissiveIntensity: 2.2,
        roughness: 0.3,
      })
    );

    const extrudeSettings = {
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.022,
      bevelSegments: 2,
      curveSegments: 14,
    };

    const hullGeometry = trackGeometry(
      new ExtrudeGeometry(buildHullShape(), { ...extrudeSettings, depth: BIKE_WIDTH })
    );
    // Drawn side-on, so turn it to face down the bike's length and centre it.
    hullGeometry.rotateY(-Math.PI / 2);
    hullGeometry.translate(BIKE_WIDTH / 2, 0, 0);
    bike.add(new Mesh(hullGeometry, bodyMaterial));

    // The pale beam slung under the hull between the wheels.
    const belly = new Mesh(unitBoxGeometry, trimMaterial);
    belly.scale.set(BIKE_WIDTH * 0.62, 0.07, 0.95);
    belly.position.set(0, 0.2, 0.02);
    bike.add(belly);

    // Canopy: a dark bubble over the saddle, narrower than the hull.
    const canopyShape = new Shape();
    canopyShape.moveTo(-0.26, 0.62);
    canopyShape.quadraticCurveTo(-0.12, 0.98, 0.14, 0.94);
    canopyShape.quadraticCurveTo(0.32, 0.9, 0.34, 0.64);
    canopyShape.closePath();

    const canopyWidth = BIKE_WIDTH * 0.72;
    const canopyGeometry = trackGeometry(
      new ExtrudeGeometry(canopyShape, { ...extrudeSettings, depth: canopyWidth })
    );
    canopyGeometry.rotateY(-Math.PI / 2);
    canopyGeometry.translate(canopyWidth / 2, 0, 0);
    bike.add(new Mesh(canopyGeometry, darkMaterial));

    const hubGeometry = trackGeometry(new SphereGeometry(0.085, 14, 10));

    for (const wheel of WHEELS) {
      // The fender is a band right around the wheel, standing proud of the
      // hull. On the film's bike it is the widest thing on it, and from behind
      // it is most of what you can see.
      const fender = new Mesh(
        trackGeometry(
          new CylinderGeometry(
            wheel.radius + 0.07,
            wheel.radius + 0.07,
            BIKE_WIDTH + 0.16,
            26,
            1,
            true
          )
        ),
        fenderMaterial
      );
      fender.rotation.z = Math.PI / 2; // lay the cylinder on its side (axis along X)
      fender.position.set(0, wheel.y, wheel.x);
      bike.add(fender);

      const tyre = new Mesh(
        trackGeometry(new TorusGeometry(wheel.radius - 0.06, 0.06, 10, 26)),
        darkMaterial
      );
      // A torus faces +Z by default; turn it to roll along the bike's length.
      tyre.rotation.y = Math.PI / 2;
      tyre.position.set(0, wheel.y, wheel.x);
      bike.add(tyre);

      const disc = new Mesh(
        trackGeometry(
          new CylinderGeometry(wheel.radius - 0.11, wheel.radius - 0.11, 0.09, 22)
        ),
        trimMaterial
      );
      disc.rotation.z = Math.PI / 2; // lay the cylinder on its side (axis along X)
      disc.position.set(0, wheel.y, wheel.x);
      bike.add(disc);

      const hub = new Mesh(hubGeometry, hubMaterial);
      hub.position.set(0, wheel.y, wheel.x);
      bike.add(hub);
    }

    // A dark panel across the tail, so the back of the bike — which is what a
    // chase camera looks at all day — isn't one flat block of colour.
    const tailPanel = new Mesh(unitBoxGeometry, darkMaterial);
    tailPanel.scale.set(BIKE_WIDTH * 0.78, 0.26, 0.1);
    tailPanel.position.set(0, 0.38, 1.08);
    bike.add(tailPanel);

    const bikeLight = new PointLight(color, 3, 6, 2);
    bikeLight.position.set(0, 0.7, 0);
    bike.add(bikeLight);

    /*
     * Drawn at a comfortable size to author and then taken down to the arena's
     * scale: a bike longer than the cell it turns inside clips through its own
     * wall on every corner.
     */
    bike.scale.setScalar(0.8);

    return {
      group: bike,
      tintedMaterials: [bodyMaterial, fenderMaterial, hubMaterial],
      light: bikeLight,
    };
  }

  /**
   * Make sure there is a bike, a wall colour and a name tag for every rider —
   * and that they still match. Each level fields a different rival, so colour
   * and name are kept in step rather than fixed at creation.
   */
  function syncPlayerVisuals(players: PlayerRenderView[]): void {
    while (playerVisuals.length < players.length) {
      const index = playerVisuals.length;
      const color = new Color(players[index].color);
      const parts = buildBike(color);
      scene.add(parts.group);

      const labelMaterial = trackMaterial(
        new SpriteMaterial({ transparent: true, depthTest: false })
      );
      const label = new Sprite(labelMaterial);
      label.renderOrder = 10;
      scene.add(label);

      const visual: PlayerVisual = {
        bike: parts.group,
        tintedMaterials: parts.tintedMaterials,
        bikeLight: parts.light,
        label,
        labelMaterial,
        labelText: "",
        colorHex: players[index].color,
        panelMaterial: trackMaterial(
          new MeshStandardMaterial({
            color: 0x05060a,
            emissive: color,
            emissiveIntensity: 0.85,
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: 0.55,
          })
        ),
        rimMaterial: trackMaterial(
          new MeshStandardMaterial({
            color: 0x05060a,
            emissive: color,
            emissiveIntensity: 2.6,
            roughness: 0.3,
          })
        ),
        trailMeshes: [],
        activeRun: null,
        // A renderer can be created mid-round (view switch, a restored WebGL
        // context), so the first frame reconstructs what the lattice holds.
        needsTrailRebuild: true,
        wasAlive: true,
        roll: 0,
      };

      applyLabel(visual, players[index].label, players[index].color);
      playerVisuals.push(visual);
    }

    players.forEach((player, index) => {
      const visual = playerVisuals[index];

      if (visual.colorHex !== player.color) {
        const color = new Color(player.color);
        visual.colorHex = player.color;
        visual.panelMaterial.emissive.copy(color);
        visual.rimMaterial.emissive.copy(color);
        for (const material of visual.tintedMaterials) {
          material.emissive.copy(color);
          // The hull is painted in the colour as well as lit by it.
          if (material.color.getHex() !== 0x0a0c14) material.color.copy(color);
        }
        visual.bikeLight.color.copy(color);
        applyLabel(visual, player.label, player.color);
      } else if (visual.labelText !== player.label) {
        applyLabel(visual, player.label, player.color);
      }
    });
  }

  function clearTrailMeshes(visual: PlayerVisual): void {
    for (const mesh of visual.trailMeshes) scene.remove(mesh);
    visual.trailMeshes = [];
    visual.activeRun = null;
  }

  function applySpan(
    panel: Mesh,
    rim: Mesh,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    direction: TrailRunState["direction"]
  ): void {
    const span = spanBetween(startX, startZ, endX, endZ, direction);

    panel.position.set(span.centerX, TRAIL_HEIGHT / 2, span.centerZ);
    panel.scale.set(
      span.horizontal ? span.length : TRAIL_THICKNESS,
      TRAIL_HEIGHT,
      span.horizontal ? TRAIL_THICKNESS : span.length
    );

    rim.position.set(span.centerX, TRAIL_HEIGHT, span.centerZ);
    rim.scale.set(
      span.horizontal ? span.length : TRAIL_RIM_THICKNESS,
      TRAIL_RIM_HEIGHT,
      span.horizontal ? TRAIL_RIM_THICKNESS : span.length
    );
  }

  function createSegmentMeshes(visual: PlayerVisual): { panel: Mesh; rim: Mesh } {
    const panel = new Mesh(unitBoxGeometry, visual.panelMaterial);
    const rim = new Mesh(unitBoxGeometry, visual.rimMaterial);
    scene.add(panel);
    scene.add(rim);
    visual.trailMeshes.push(panel, rim);
    return { panel, rim };
  }

  function startRun(
    visual: PlayerVisual,
    startX: number,
    startZ: number,
    direction: TrailRunState["direction"]
  ): NonNullable<PlayerVisual["activeRun"]> {
    const { panel, rim } = createSegmentMeshes(visual);
    const run = { startX, startZ, direction, panel, rim };

    applySpan(panel, rim, startX, startZ, startX, startZ, direction);
    visual.activeRun = run;
    return run;
  }

  function addStaticSegment(
    visual: PlayerVisual,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    direction: TrailRunState["direction"]
  ): void {
    const { panel, rim } = createSegmentMeshes(visual);
    applySpan(panel, rim, startX, startZ, endX, endZ, direction);
  }

  /**
   * Rebuild every wall straight from the occupancy lattice, merging collinear
   * edges into one segment per straight stretch. Only used as a fallback, since
   * walls are normally grown incrementally as the bike rides.
   */
  function rebuildTrailFromLattice(visual: PlayerVisual, trail: LatticeMatrix): void {
    clearTrailMeshes(visual);

    const maxLatticeRow = grid.rows * 2;
    const maxLatticeColumn = grid.columns * 2;

    // Horizontal edges live at (even row, odd column).
    for (let row = 0; row <= maxLatticeRow; row += 2) {
      const z = latticeToWorldZ(row, grid);
      let runStartColumn = -1;

      for (let column = 1; column < maxLatticeColumn; column += 2) {
        if (trail[row][column]) {
          if (runStartColumn < 0) runStartColumn = column - 1;
        } else if (runStartColumn >= 0) {
          addStaticSegment(
            visual,
            latticeToWorldX(runStartColumn, grid), z,
            latticeToWorldX(column - 1, grid), z,
            "right"
          );
          runStartColumn = -1;
        }
      }
      if (runStartColumn >= 0) {
        addStaticSegment(
          visual,
          latticeToWorldX(runStartColumn, grid), z,
          latticeToWorldX(maxLatticeColumn, grid), z,
          "right"
        );
      }
    }

    // Vertical edges live at (odd row, even column).
    for (let column = 0; column <= maxLatticeColumn; column += 2) {
      const x = latticeToWorldX(column, grid);
      let runStartRow = -1;

      for (let row = 1; row < maxLatticeRow; row += 2) {
        if (trail[row][column]) {
          if (runStartRow < 0) runStartRow = row - 1;
        } else if (runStartRow >= 0) {
          addStaticSegment(
            visual,
            x, latticeToWorldZ(runStartRow, grid),
            x, latticeToWorldZ(row - 1, grid),
            "down"
          );
          runStartRow = -1;
        }
      }
      if (runStartRow >= 0) {
        addStaticSegment(
          visual,
          x, latticeToWorldZ(runStartRow, grid),
          x, latticeToWorldZ(maxLatticeRow, grid),
          "down"
        );
      }
    }

    visual.needsTrailRebuild = false;
  }

  /**
   * Grow the wall behind one bike.
   * `corner` is the vertex the bike is riding away from (where a turn happened),
   * `tip` is its interpolated position right now.
   */
  function updateTrail(
    visual: PlayerVisual,
    player: PlayerRenderView,
    cornerX: number,
    cornerZ: number,
    tipX: number,
    tipZ: number
  ): void {
    if (visual.needsTrailRebuild) rebuildTrailFromLattice(visual, player.trail);

    if (!player.isLayingWall) {
      // Nothing is being laid, so the wall stops where it stopped. Closing the
      // run on the corner leaves the gap open behind the bike.
      const openRun = visual.activeRun;
      if (openRun) {
        applySpan(
          openRun.panel,
          openRun.rim,
          openRun.startX,
          openRun.startZ,
          cornerX,
          cornerZ,
          openRun.direction
        );
        visual.activeRun = null;
      }
      return;
    }

    const action = decideTrailAction(visual.activeRun, cornerX, cornerZ, player.direction);
    let run = visual.activeRun;

    if (action === "turn" && run) {
      // Close the previous stretch exactly on the corner, then turn.
      applySpan(run.panel, run.rim, run.startX, run.startZ, cornerX, cornerZ, run.direction);
      run = null;
    } else if (action === "rebuild") {
      // A stall swallowed one or more ticks and we missed a corner: the lattice
      // is the source of truth, so redraw the whole trail from it.
      rebuildTrailFromLattice(visual, player.trail);
      run = null;
    }

    if (!run) run = startRun(visual, cornerX, cornerZ, player.direction);

    const tip = clipTipBehindBike(run, tipX, tipZ, TRAIL_TIP_GAP);
    applySpan(run.panel, run.rim, run.startX, run.startZ, tip.x, tip.z, run.direction);
  }

  function spawnCrashDebris(visual: PlayerVisual, x: number, z: number): void {
    if (prefersReducedMotion) return;

    for (let piece = 0; piece < DEBRIS_PER_CRASH; piece += 1) {
      const mesh = new Mesh(unitBoxGeometry, visual.rimMaterial);
      const size = 0.1 + Math.random() * 0.16;

      mesh.scale.setScalar(size);
      mesh.position.set(x, 0.5 + Math.random() * 0.4, z);
      mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      scene.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5;
      debris.push({
        mesh,
        velocity: new Vector3(
          Math.cos(angle) * speed,
          3 + Math.random() * 5,
          Math.sin(angle) * speed
        ),
        // Long enough to still be in the air when the verdict arrives, which
        // is a second after the crash.
        remainingLife: 1.1 + Math.random() * 0.7,
      });
    }

    // A crash you feel: nearer wrecks shake the camera harder.
    const distance = camera.position.distanceTo(new Vector3(x, 0.5, z));
    cameraShake = Math.max(cameraShake, CAMERA_SHAKE_ON_CRASH / (1 + distance / 12));
  }

  function updateDebris(deltaSeconds: number): void {
    for (let index = debris.length - 1; index >= 0; index -= 1) {
      const piece = debris[index];

      piece.remainingLife -= deltaSeconds;
      if (piece.remainingLife <= 0) {
        scene.remove(piece.mesh);
        debris.splice(index, 1);
        continue;
      }

      piece.velocity.y -= DEBRIS_GRAVITY * deltaSeconds;
      piece.mesh.position.addScaledVector(piece.velocity, deltaSeconds);
      piece.mesh.rotation.x += deltaSeconds * 6;
      piece.mesh.rotation.y += deltaSeconds * 4;

      if (piece.mesh.position.y < 0.06) {
        // Bounce, losing most of the energy each time.
        piece.mesh.position.y = 0.06;
        piece.velocity.y = Math.abs(piece.velocity.y) * 0.35;
        piece.velocity.multiplyScalar(0.6);
      }
    }
  }

  function clearDebris(): void {
    for (const piece of debris) scene.remove(piece.mesh);
    debris.length = 0;
  }

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /** Your own name is a reminder that fades; theirs is information that stays. */
  function labelOpacity(player: PlayerRenderView): number {
    if (!player.isAlive) return 0;
    if (player.labelMode === "always") return 1;

    const remaining = LABEL_BRIEF_SECONDS - roundElapsedSeconds;
    if (remaining <= 0) return 0;
    return Math.min(1, remaining / LABEL_FADE_SECONDS);
  }

  function updateLabel(
    visual: PlayerVisual,
    player: PlayerRenderView,
    x: number,
    z: number
  ): void {
    const opacity = labelOpacity(player);
    visual.label.visible = opacity > 0.01;
    if (!visual.label.visible) return;

    visual.label.position.set(x, LABEL_HEIGHT, z);
    visual.labelMaterial.opacity = opacity;

    // Scaled by distance so it keeps the same size on screen: a rival across
    // the arena stays readable without shouting at you up close.
    const distance = camera.position.distanceTo(visual.label.position);
    const height = clamp(
      distance * LABEL_SCREEN_SCALE,
      LABEL_MINIMUM_SCALE,
      LABEL_MAXIMUM_SCALE
    );
    const aspect = (visual.label.userData.aspect as number | undefined) ?? 4;
    visual.label.scale.set(height * aspect, height, 1);
  }

  /** A wider lens at speed. Subtle, and the first thing reduced motion drops. */
  function updateFieldOfView(speedFactor: number): void {
    const kick = prefersReducedMotion ? 0 : speedFactor * FOV_SPEED_KICK_DEGREES;
    const desired = verticalFovForAspect(camera.aspect) + kick;

    if (Math.abs(desired - appliedFovKick) < 0.01) return;
    appliedFovKick = desired;
    camera.fov = desired;
    camera.updateProjectionMatrix();
  }

  /**
   * Trade resolution for smoothness when the device can't keep up, and take it
   * back when it can. Phones vary far too much to pick a number in advance.
   */
  function reviewResolution(deltaSeconds: number): void {
    if (deltaSeconds <= 0) return;

    frameTimeAverage += (deltaSeconds * 1000 - frameTimeAverage) * 0.1;
    secondsSinceResolutionReview += deltaSeconds;
    if (secondsSinceResolutionReview < RESOLUTION_REVIEW_SECONDS) return;
    secondsSinceResolutionReview = 0;

    let nextPixelRatio = currentPixelRatio;
    if (frameTimeAverage > FRAME_BUDGET_MILLISECONDS) {
      nextPixelRatio = Math.max(MINIMUM_PIXEL_RATIO, currentPixelRatio - RESOLUTION_STEP);
    } else if (frameTimeAverage < FRAME_COMFORT_MILLISECONDS) {
      nextPixelRatio = Math.min(maximumPixelRatio, currentPixelRatio + RESOLUTION_STEP);
    }

    if (nextPixelRatio === currentPixelRatio) return;

    currentPixelRatio = nextPixelRatio;
    renderer.setPixelRatio(nextPixelRatio);
    resize();
  }

  function updateCamera(leadBike: Group, deltaSeconds: number): void {
    const yaw = leadBike.rotation.y;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);

    const desiredX = leadBike.position.x - forwardX * CAMERA_BACK_DISTANCE;
    const desiredZ = leadBike.position.z - forwardZ * CAMERA_BACK_DISTANCE;
    const targetLookX = leadBike.position.x + forwardX * CAMERA_LOOK_AHEAD;
    const targetLookZ = leadBike.position.z + forwardZ * CAMERA_LOOK_AHEAD;

    const extraFov = Math.max(0, camera.fov - BASE_VERTICAL_FOV_DEGREES);
    const lookHeight = CAMERA_LOOK_HEIGHT - extraFov * LOOK_DROP_PER_EXTRA_FOV_DEGREE;

    if (shouldSnapCamera) {
      cameraAnchor.set(desiredX, CAMERA_HEIGHT, desiredZ);
      cameraLookTarget.set(targetLookX, lookHeight, targetLookZ);
      shouldSnapCamera = false;
    } else {
      const factor = smoothingFactor(CAMERA_FOLLOW_RESPONSIVENESS, deltaSeconds);
      cameraAnchor.x = lerp(cameraAnchor.x, desiredX, factor);
      cameraAnchor.y = lerp(cameraAnchor.y, CAMERA_HEIGHT, factor);
      cameraAnchor.z = lerp(cameraAnchor.z, desiredZ, factor);
      cameraLookTarget.x = lerp(cameraLookTarget.x, targetLookX, factor);
      cameraLookTarget.y = lerp(cameraLookTarget.y, lookHeight, factor);
      cameraLookTarget.z = lerp(cameraLookTarget.z, targetLookZ, factor);
    }

    // Shake is applied on top of the smoothed anchor, never fed back into it,
    // so the camera doesn't wander off while it rattles.
    cameraShake = Math.max(0, cameraShake - CAMERA_SHAKE_DECAY * deltaSeconds * cameraShake);
    if (cameraShake > 0.001 && !prefersReducedMotion) {
      camera.position.set(
        cameraAnchor.x + (Math.random() - 0.5) * cameraShake,
        cameraAnchor.y + (Math.random() - 0.5) * cameraShake,
        cameraAnchor.z + (Math.random() - 0.5) * cameraShake
      );
    } else {
      camera.position.copy(cameraAnchor);
    }

    camera.lookAt(cameraLookTarget);
  }

  /** Hor+ scaling: keep the horizontal field of view, widen the vertical one. */
  function verticalFovForAspect(aspect: number): number {
    const baseHalfTangent = Math.tan((BASE_VERTICAL_FOV_DEGREES * Math.PI) / 360);
    const halfTangent = (baseHalfTangent * BASE_ASPECT) / aspect;
    const fovDegrees = (Math.atan(halfTangent) * 360) / Math.PI;

    return Math.min(
      MAXIMUM_VERTICAL_FOV_DEGREES,
      Math.max(BASE_VERTICAL_FOV_DEGREES, fovDegrees)
    );
  }

  function resize(): void {
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);

    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Forget the applied kick so the new aspect is picked up next frame.
    appliedFovKick = -1;
    camera.fov = verticalFovForAspect(camera.aspect);
    camera.updateProjectionMatrix();

    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
  }

  function draw(frame: RenderFrame): void {
    // Drawing into a lost context throws on some drivers; wait for the restore.
    if (contextLost) return;

    const now = performance.now();
    // Clamp so a background tab (or the first frame) doesn't teleport the camera.
    const deltaSeconds = lastFrameTimestamp
      ? Math.min(0.1, (now - lastFrameTimestamp) / 1000)
      : 0;
    lastFrameTimestamp = now;

    roundElapsedSeconds += deltaSeconds;
    syncPlayerVisuals(frame.players);
    updateFieldOfView(frame.speedFactor);

    frame.players.forEach((player, index) => {
      const visual = playerVisuals[index];

      const cornerX = latticeToWorldX(player.previousHeadLatticeIndex.columnIndexInLattice, grid);
      const cornerZ = latticeToWorldZ(player.previousHeadLatticeIndex.rowIndexInLattice, grid);
      const headX = latticeToWorldX(player.headLatticeIndex.columnIndexInLattice, grid);
      const headZ = latticeToWorldZ(player.headLatticeIndex.rowIndexInLattice, grid);

      const progress = player.isAlive ? frame.interpolationAlpha : 1;
      const tipX = lerp(cornerX, headX, progress);
      const tipZ = lerp(cornerZ, headZ, progress);

      if (visual.wasAlive && !player.isAlive) {
        spawnCrashDebris(visual, tipX, tipZ);
        // The rider derezzes and the wall goes out with them.
        clearTrailMeshes(visual);
      }
      visual.wasAlive = player.isAlive;
      visual.bike.visible = player.isAlive;

      visual.bike.position.set(tipX, 0, tipZ);

      const yawDelta = shortestAngleDelta(
        visual.bike.rotation.y,
        directionToYaw(player.direction)
      );
      const appliedYaw = yawDelta * smoothingFactor(BIKE_TURN_RESPONSIVENESS, deltaSeconds);
      visual.bike.rotation.y += appliedYaw;

      // Lean into the turn. Riders do it, and it reads at a glance.
      const turnRate = deltaSeconds > 0 ? appliedYaw / deltaSeconds : 0;
      const targetRoll = prefersReducedMotion
        ? 0
        : clamp(turnRate * BIKE_ROLL_PER_TURN_RATE, -BIKE_MAXIMUM_ROLL, BIKE_MAXIMUM_ROLL);
      visual.roll += (targetRoll - visual.roll) *
        smoothingFactor(BIKE_ROLL_RESPONSIVENESS, deltaSeconds);
      visual.bike.rotation.z = visual.roll;

      updateLabel(visual, player, tipX, tipZ);
      updateTrail(visual, player, cornerX, cornerZ, tipX, tipZ);
    });

    updateDebris(deltaSeconds);
    reviewResolution(deltaSeconds);
    if (playerVisuals.length > 0) updateCamera(playerVisuals[0].bike, deltaSeconds);

    if (composer) composer.render(deltaSeconds);
    else renderer.render(scene, camera);
  }

  function resetRound(): void {
    for (const visual of playerVisuals) {
      clearTrailMeshes(visual);
      visual.needsTrailRebuild = false;
      visual.wasAlive = true;
      visual.bike.visible = true;
      visual.roll = 0;
      visual.bike.rotation.z = 0;
    }
    clearDebris();
    cameraShake = 0;
    shouldSnapCamera = true;
    lastFrameTimestamp = 0;
    // Name tags come back up for a moment at the start of every round.
    roundElapsedSeconds = 0;
  }

  function dispose(): void {
    canvas.removeEventListener("webglcontextlost", handleContextLost);
    canvas.removeEventListener("webglcontextrestored", handleContextRestored);

    for (const visual of playerVisuals) {
      clearTrailMeshes(visual);
      visual.labelMaterial.map?.dispose();
      scene.remove(visual.label);
    }
    playerVisuals.length = 0;
    clearDebris();

    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    composer?.dispose();
    renderer.dispose();
  }

  return { resize, draw, resetRound, dispose };
}
