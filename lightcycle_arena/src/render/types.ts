// src/render/types.ts
import type { GridConfig } from "../utils/gridConfig";
import type { Direction, LatticeIndex, LatticeMatrix } from "../utils/latticeHelpers";

/**
 * Everything a renderer needs to know about one player for a single frame.
 * Deliberately a plain view object: renderers never touch game state.
 */
export interface PlayerRenderView {
  color: string;
  /** Name floated above the bike in the 3D view. */
  label: string;
  /**
   * "always" keeps the name up — you need to know who you are chasing.
   * "brief" shows it for a moment at the start of a round, which is all the
   * reminder anyone needs of their own name.
   */
  labelMode: "always" | "brief";
  headLatticeIndex: LatticeIndex;
  /** Vertex the head came from during the current tick (for interpolation). */
  previousHeadLatticeIndex: LatticeIndex;
  direction: Direction;
  isAlive: boolean;
  /** False while the rider is cutting: the wall stops growing behind them. */
  isLayingWall: boolean;
  trail: LatticeMatrix;
}

/**
 * One frame of the game, in render-agnostic terms.
 */
export interface RenderFrame {
  grid: GridConfig;
  players: PlayerRenderView[];
  /**
   * Progress between previousHead and head inside the current logic tick (0..1).
   * The 2D renderer ignores it (cells are discrete); the 3D renderer needs it,
   * because logic runs at 10 Hz and the camera at display rate.
   */
  interpolationAlpha: number;
  /** 0 at the slowest level, 1 at the fastest. Drives the sense of speed. */
  speedFactor: number;
}

/**
 * Contract implemented by the 2D canvas renderer and the 3D (three.js) one.
 * The game loop in GameCanvas talks only to this.
 */
export interface GameRenderer {
  /** Re-fit the drawing surface to its container. */
  resize(): void;
  draw(frame: RenderFrame): void;
  /** Drop anything accumulated during a round (3D trail meshes). */
  resetRound(): void;
  dispose(): void;
}
