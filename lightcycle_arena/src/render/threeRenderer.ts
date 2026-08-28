// src/render/threeRenderer.ts
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
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
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
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

const TRAIL_HEIGHT = 1.35;
const TRAIL_THICKNESS = 0.26;
const TRAIL_RIM_HEIGHT = 0.13;
const TRAIL_RIM_THICKNESS = 0.34;
/**
 * The wall is laid a bit behind the rear wheel. Without this gap the bike sits
 * inside its own glow and the chase camera can't read its silhouette.
 */
const TRAIL_TIP_GAP = 0.95;

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
const CAMERA_HEIGHT = 2.7;
const CAMERA_LOOK_AHEAD = 11;
const CAMERA_LOOK_HEIGHT = 1;
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
  glowMaterial: MeshStandardMaterial;
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
    glowMaterial: MeshStandardMaterial;
    light: PointLight;
  }

  function buildBike(color: Color): BikeParts {
    const bike = new Group();
    // Yaw first, then roll about the bike's own length, so leaning into a turn
    // tips the rider rather than swinging the whole bike sideways.
    bike.rotation.order = "YZX";

    const chassisMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x1c2334, roughness: 0.35, metalness: 0.7 })
    );
    const darkMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x0a0d16, roughness: 0.5, metalness: 0.6 })
    );
    const glowMaterial = trackMaterial(
      new MeshStandardMaterial({
        color: 0x05050a,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.3,
      })
    );

    const hull = new Mesh(unitBoxGeometry, chassisMaterial);
    hull.scale.set(0.5, 0.3, 1.9);
    hull.position.y = 0.46;
    bike.add(hull);

    // Nose cone, so the bike reads as pointing somewhere from behind.
    const nose = new Mesh(trackGeometry(new ConeGeometry(0.26, 0.7, 4)), chassisMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.rotation.y = Math.PI / 4;
    nose.position.set(0, 0.46, -1.2);
    bike.add(nose);

    // Light spine, the part that carries at distance.
    const spine = new Mesh(unitBoxGeometry, glowMaterial);
    spine.scale.set(0.22, 0.12, 1.55);
    spine.position.y = 0.65;
    bike.add(spine);

    // Fairings flaring out over each wheel.
    for (const side of [-1, 1]) {
      const fairing = new Mesh(unitBoxGeometry, darkMaterial);
      fairing.scale.set(0.12, 0.2, 1.1);
      fairing.position.set(side * 0.3, 0.5, 0);
      fairing.rotation.z = side * 0.25;
      bike.add(fairing);
    }

    const rider = new Mesh(unitBoxGeometry, darkMaterial);
    rider.scale.set(0.32, 0.46, 0.46);
    rider.position.set(0, 0.86, 0.16);
    bike.add(rider);

    const canopy = new Mesh(unitBoxGeometry, glowMaterial);
    canopy.scale.set(0.24, 0.08, 0.5);
    canopy.position.set(0, 1.09, 0.16);
    bike.add(canopy);

    const wheelGeometry = trackGeometry(new CylinderGeometry(0.36, 0.36, 0.16, 18));
    const rimGeometry = trackGeometry(new TorusGeometry(0.36, 0.05, 8, 22));

    for (const wheelZ of [-0.68, 0.68]) {
      const wheel = new Mesh(wheelGeometry, darkMaterial);
      wheel.rotation.z = Math.PI / 2; // lay the cylinder on its side (axis along X)
      wheel.position.set(0, 0.36, wheelZ);
      bike.add(wheel);

      const wheelRim = new Mesh(rimGeometry, glowMaterial);
      wheelRim.rotation.y = Math.PI / 2; // torus faces +Z by default; turn it to face +X
      wheelRim.position.set(0, 0.36, wheelZ);
      bike.add(wheelRim);
    }

    const bikeLight = new PointLight(color, 3, 6, 2);
    bikeLight.position.set(0, 0.9, 0);
    bike.add(bikeLight);

    return { group: bike, glowMaterial, light: bikeLight };
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
        glowMaterial: parts.glowMaterial,
        bikeLight: parts.light,
        label,
        labelMaterial,
        labelText: "",
        colorHex: players[index].color,
        panelMaterial: trackMaterial(
          new MeshStandardMaterial({
            color: 0x05060a,
            emissive: color,
            emissiveIntensity: 0.8,
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: 0.5,
          })
        ),
        rimMaterial: trackMaterial(
          new MeshStandardMaterial({
            color: 0x05060a,
            emissive: color,
            emissiveIntensity: 1.6,
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
        visual.glowMaterial.emissive.copy(color);
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
        remainingLife: 0.9 + Math.random() * 0.6,
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

    if (shouldSnapCamera) {
      cameraAnchor.set(desiredX, CAMERA_HEIGHT, desiredZ);
      cameraLookTarget.set(targetLookX, CAMERA_LOOK_HEIGHT, targetLookZ);
      shouldSnapCamera = false;
    } else {
      const factor = smoothingFactor(CAMERA_FOLLOW_RESPONSIVENESS, deltaSeconds);
      cameraAnchor.x = lerp(cameraAnchor.x, desiredX, factor);
      cameraAnchor.y = lerp(cameraAnchor.y, CAMERA_HEIGHT, factor);
      cameraAnchor.z = lerp(cameraAnchor.z, desiredZ, factor);
      cameraLookTarget.x = lerp(cameraLookTarget.x, targetLookX, factor);
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

      if (visual.wasAlive && !player.isAlive) spawnCrashDebris(visual, tipX, tipZ);
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
