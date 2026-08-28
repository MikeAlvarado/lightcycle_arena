// src/render/threeRenderer.ts
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
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
import type { Direction, LatticeMatrix } from "../utils/latticeHelpers";
import type { GameRenderer, PlayerRenderView, RenderFrame } from "./types";
import {
  DIRECTION_VECTORS,
  WORLD_CELL_SIZE,
  directionToYaw,
  isHorizontal,
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
const MINIMUM_TRAIL_LENGTH = 0.001;
/**
 * The wall is emitted a bit behind the rear wheel. Without this gap the bike
 * sits inside its own glow and the chase camera can't read its silhouette.
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

export interface ThreeRendererOptions {
  /** Bloom is the expensive part; callers turn it off on phones. */
  enableBloom?: boolean;
}

/** A wall is a translucent panel capped by a bright rim, drawn as two boxes. */
interface TrailSegment {
  panel: Mesh;
  rim: Mesh;
}

/** One straight stretch of light wall, still growing behind its bike. */
interface TrailRun {
  segment: TrailSegment;
  startX: number;
  startZ: number;
  direction: Direction;
}

interface PlayerVisual {
  bike: Group;
  panelMaterial: MeshStandardMaterial;
  rimMaterial: MeshStandardMaterial;
  trailMeshes: Mesh[];
  activeRun: TrailRun | null;
  /** Set when the wall meshes no longer match the lattice and must be redone. */
  needsTrailRebuild: boolean;
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

  const playerVisuals: PlayerVisual[] = [];
  const cameraLookTarget = new Vector3(0, CAMERA_LOOK_HEIGHT, 0);
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

  function buildBike(color: Color): Group {
    const bike = new Group();

    const chassisMaterial = trackMaterial(
      new MeshStandardMaterial({ color: 0x1c2334, roughness: 0.35, metalness: 0.7 })
    );
    const glowMaterial = trackMaterial(
      new MeshStandardMaterial({
        color: 0x05050a,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.3,
      })
    );

    const chassis = new Mesh(unitBoxGeometry, chassisMaterial);
    chassis.scale.set(0.55, 0.36, 1.85);
    chassis.position.y = 0.46;
    bike.add(chassis);

    // Full-length light strip along the spine, the part that reads at distance.
    const lightStrip = new Mesh(unitBoxGeometry, glowMaterial);
    lightStrip.scale.set(0.26, 0.12, 1.5);
    lightStrip.position.y = 0.67;
    bike.add(lightStrip);

    // Rider: a small block that breaks the silhouette against the floor.
    const rider = new Mesh(unitBoxGeometry, chassisMaterial);
    rider.scale.set(0.34, 0.5, 0.5);
    rider.position.set(0, 0.88, 0.12);
    bike.add(rider);

    const wheelGeometry = trackGeometry(new CylinderGeometry(0.36, 0.36, 0.18, 16));
    const rimGeometry = trackGeometry(new TorusGeometry(0.36, 0.055, 8, 20));

    for (const wheelZ of [-0.66, 0.66]) {
      const wheel = new Mesh(wheelGeometry, chassisMaterial);
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

    return bike;
  }

  function ensurePlayerVisuals(players: PlayerRenderView[]): void {
    while (playerVisuals.length < players.length) {
      const index = playerVisuals.length;
      const color = new Color(players[index].color);
      const bike = buildBike(color);
      scene.add(bike);

      playerVisuals.push({
        bike,
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
        // A renderer can be created mid-round (mode switch, device rotation),
        // so the first frame reconstructs whatever the lattice already holds.
        needsTrailRebuild: true,
      });
    }
  }

  function clearTrailMeshes(visual: PlayerVisual): void {
    for (const mesh of visual.trailMeshes) scene.remove(mesh);
    visual.trailMeshes = [];
    visual.activeRun = null;
  }

  function createTrailSegment(visual: PlayerVisual): TrailSegment {
    const panel = new Mesh(unitBoxGeometry, visual.panelMaterial);
    const rim = new Mesh(unitBoxGeometry, visual.rimMaterial);
    scene.add(panel);
    scene.add(rim);
    visual.trailMeshes.push(panel, rim);
    return { panel, rim };
  }

  function spanSegment(
    segment: TrailSegment,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    horizontal: boolean
  ): void {
    const length = Math.max(
      MINIMUM_TRAIL_LENGTH,
      horizontal ? Math.abs(endX - startX) : Math.abs(endZ - startZ)
    );
    const centerX = horizontal ? (startX + endX) / 2 : startX;
    const centerZ = horizontal ? startZ : (startZ + endZ) / 2;

    segment.panel.position.set(centerX, TRAIL_HEIGHT / 2, centerZ);
    segment.panel.scale.set(
      horizontal ? length : TRAIL_THICKNESS,
      TRAIL_HEIGHT,
      horizontal ? TRAIL_THICKNESS : length
    );

    segment.rim.position.set(centerX, TRAIL_HEIGHT, centerZ);
    segment.rim.scale.set(
      horizontal ? length : TRAIL_RIM_THICKNESS,
      TRAIL_RIM_HEIGHT,
      horizontal ? TRAIL_RIM_THICKNESS : length
    );
  }

  function startRun(
    visual: PlayerVisual,
    startX: number,
    startZ: number,
    direction: Direction
  ): TrailRun {
    const run: TrailRun = {
      segment: createTrailSegment(visual),
      startX,
      startZ,
      direction,
    };
    spanSegment(run.segment, startX, startZ, startX, startZ, isHorizontal(direction));
    visual.activeRun = run;
    return run;
  }

  /** Grow the active run up to the bike, minus the gap behind its rear wheel. */
  function spanRunToBike(run: TrailRun, tipX: number, tipZ: number): void {
    const forward = DIRECTION_VECTORS[run.direction];
    const travelled = (tipX - run.startX) * forward.x + (tipZ - run.startZ) * forward.z;
    const drawn = Math.max(0, travelled - TRAIL_TIP_GAP);

    spanSegment(
      run.segment,
      run.startX,
      run.startZ,
      run.startX + forward.x * drawn,
      run.startZ + forward.z * drawn,
      isHorizontal(run.direction)
    );
  }

  function addStaticTrailSegment(
    visual: PlayerVisual,
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    horizontal: boolean
  ): void {
    spanSegment(createTrailSegment(visual), startX, startZ, endX, endZ, horizontal);
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
          addStaticTrailSegment(
            visual,
            latticeToWorldX(runStartColumn, grid), z,
            latticeToWorldX(column - 1, grid), z,
            true
          );
          runStartColumn = -1;
        }
      }
      if (runStartColumn >= 0) {
        addStaticTrailSegment(
          visual,
          latticeToWorldX(runStartColumn, grid), z,
          latticeToWorldX(maxLatticeColumn, grid), z,
          true
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
          addStaticTrailSegment(
            visual,
            x, latticeToWorldZ(runStartRow, grid),
            x, latticeToWorldZ(row - 1, grid),
            false
          );
          runStartRow = -1;
        }
      }
      if (runStartRow >= 0) {
        addStaticTrailSegment(
          visual,
          x, latticeToWorldZ(runStartRow, grid),
          x, latticeToWorldZ(maxLatticeRow, grid),
          false
        );
      }
    }

    visual.needsTrailRebuild = false;
  }

  /** True when the turn corner is no longer on the active run's axis. */
  function isOffRunAxis(run: TrailRun, cornerX: number, cornerZ: number): boolean {
    const epsilon = 1e-6;
    return isHorizontal(run.direction)
      ? Math.abs(cornerZ - run.startZ) > epsilon
      : Math.abs(cornerX - run.startX) > epsilon;
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

    let run = visual.activeRun;

    if (!run || run.direction !== player.direction) {
      // Close the previous stretch exactly on the corner, then turn.
      if (run) {
        spanSegment(
          run.segment,
          run.startX,
          run.startZ,
          cornerX,
          cornerZ,
          isHorizontal(run.direction)
        );
      }
      run = startRun(visual, cornerX, cornerZ, player.direction);
    } else if (isOffRunAxis(run, cornerX, cornerZ)) {
      // A stall swallowed one or more ticks and we missed a corner: the lattice
      // is the source of truth, so redraw the whole trail from it.
      rebuildTrailFromLattice(visual, player.trail);
      run = startRun(visual, cornerX, cornerZ, player.direction);
    }

    spanRunToBike(run, tipX, tipZ);
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
      camera.position.set(desiredX, CAMERA_HEIGHT, desiredZ);
      cameraLookTarget.set(targetLookX, CAMERA_LOOK_HEIGHT, targetLookZ);
      shouldSnapCamera = false;
    } else {
      const factor = smoothingFactor(CAMERA_FOLLOW_RESPONSIVENESS, deltaSeconds);
      camera.position.x = lerp(camera.position.x, desiredX, factor);
      camera.position.y = lerp(camera.position.y, CAMERA_HEIGHT, factor);
      camera.position.z = lerp(camera.position.z, desiredZ, factor);
      cameraLookTarget.x = lerp(cameraLookTarget.x, targetLookX, factor);
      cameraLookTarget.z = lerp(cameraLookTarget.z, targetLookZ, factor);
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
    camera.fov = verticalFovForAspect(camera.aspect);
    camera.updateProjectionMatrix();

    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    }
  }

  function draw(frame: RenderFrame): void {
    const now = performance.now();
    // Clamp so a background tab (or the first frame) doesn't teleport the camera.
    const deltaSeconds = lastFrameTimestamp
      ? Math.min(0.1, (now - lastFrameTimestamp) / 1000)
      : 0;
    lastFrameTimestamp = now;

    ensurePlayerVisuals(frame.players);

    frame.players.forEach((player, index) => {
      const visual = playerVisuals[index];

      const cornerX = latticeToWorldX(player.previousHeadLatticeIndex.columnIndexInLattice, grid);
      const cornerZ = latticeToWorldZ(player.previousHeadLatticeIndex.rowIndexInLattice, grid);
      const headX = latticeToWorldX(player.headLatticeIndex.columnIndexInLattice, grid);
      const headZ = latticeToWorldZ(player.headLatticeIndex.rowIndexInLattice, grid);

      const progress = player.isAlive ? frame.interpolationAlpha : 1;
      const tipX = lerp(cornerX, headX, progress);
      const tipZ = lerp(cornerZ, headZ, progress);

      visual.bike.position.set(tipX, 0, tipZ);
      const yawDelta = shortestAngleDelta(visual.bike.rotation.y, directionToYaw(player.direction));
      visual.bike.rotation.y += yawDelta * smoothingFactor(BIKE_TURN_RESPONSIVENESS, deltaSeconds);

      updateTrail(visual, player, cornerX, cornerZ, tipX, tipZ);
    });

    if (playerVisuals.length > 0) updateCamera(playerVisuals[0].bike, deltaSeconds);

    if (composer) composer.render(deltaSeconds);
    else renderer.render(scene, camera);
  }

  function resetRound(): void {
    for (const visual of playerVisuals) {
      clearTrailMeshes(visual);
      visual.needsTrailRebuild = false;
    }
    shouldSnapCamera = true;
    lastFrameTimestamp = 0;
  }

  function dispose(): void {
    for (const visual of playerVisuals) clearTrailMeshes(visual);
    playerVisuals.length = 0;

    for (const geometry of ownedGeometries) geometry.dispose();
    for (const material of ownedMaterials) material.dispose();
    composer?.dispose();
    renderer.dispose();
  }

  return { resize, draw, resetRound, dispose };
}
