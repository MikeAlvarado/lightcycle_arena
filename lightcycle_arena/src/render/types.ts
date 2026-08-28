// src/render/types.ts
import type { GridConfig } from "../utils/gridConfig";
import type { Direction, LatticeIndex, LatticeMatrix } from "../utils/latticeHelpers";

/**
 * Everything a renderer needs to know about one player for a single frame.
 * Deliberately a plain view object: renderers never touch game state.
 */
export interface PlayerRenderView {
  color: string;
  headLatticeIndex: LatticeIndex;
  /** Vertex the head came from during the current tick (for interpolation). */
  previousHeadLatticeIndex: LatticeIndex;
  direction: Direction;
  isAlive: boolean;
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
  /** Desktop-only hint drawn on the board; null hides it. */
  controlsHint: string | null;
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
