// src/render/trailGeometry.ts
import type { Direction } from "../utils/latticeHelpers";
import { DIRECTION_VECTORS, isHorizontal } from "./worldMapping";

/** Boxes with a zero dimension disappear; give a fresh wall a sliver of length. */
export const MINIMUM_TRAIL_LENGTH = 0.001;

/** One straight stretch of light wall, growing behind its bike. */
export interface TrailRunState {
  startX: number;
  startZ: number;
  direction: Direction;
}

/**
 * What the renderer should do with the wall this frame.
 * - "start":   there is no run yet; begin one at the corner.
 * - "turn":    close the current run on the corner and begin a new one.
 * - "extend":  keep growing the current run.
 * - "rebuild": the run and the lattice disagree — a stalled frame swallowed a
 *              corner — so the wall has to be redrawn from the lattice.
 */
export type TrailAction = "start" | "turn" | "extend" | "rebuild";

/** Is the turn corner still on the axis the current run runs along? */
export function isOnRunAxis(
  run: TrailRunState,
  cornerX: number,
  cornerZ: number
): boolean {
  const epsilon = 1e-6;
  return isHorizontal(run.direction)
    ? Math.abs(cornerZ - run.startZ) <= epsilon
    : Math.abs(cornerX - run.startX) <= epsilon;
}

export function decideTrailAction(
  run: TrailRunState | null,
  cornerX: number,
  cornerZ: number,
  direction: Direction
): TrailAction {
  if (!run) return "start";
  if (run.direction !== direction) return "turn";
  return isOnRunAxis(run, cornerX, cornerZ) ? "extend" : "rebuild";
}

/** Where a wall box sits and how big it is. */
export interface SegmentSpan {
  centerX: number;
  centerZ: number;
  length: number;
  horizontal: boolean;
}

/**
 * Place a box spanning two points along one axis. The off-axis coordinate is
 * taken from the start so a run can never drift sideways through rounding.
 */
export function spanBetween(
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  direction: Direction
): SegmentSpan {
  const horizontal = isHorizontal(direction);
  const length = Math.max(
    MINIMUM_TRAIL_LENGTH,
    horizontal ? Math.abs(endX - startX) : Math.abs(endZ - startZ)
  );

  return {
    centerX: horizontal ? (startX + endX) / 2 : startX,
    centerZ: horizontal ? startZ : (startZ + endZ) / 2,
    length,
    horizontal,
  };
}

/**
 * Stop the wall a little short of the bike.
 * Without the gap the rider sits inside its own glow and the chase camera can't
 * make out its silhouette. Never runs backwards past the start of the run.
 */
export function clipTipBehindBike(
  run: TrailRunState,
  tipX: number,
  tipZ: number,
  gap: number
): { x: number; z: number } {
  const forward = DIRECTION_VECTORS[run.direction];
  const travelled = (tipX - run.startX) * forward.x + (tipZ - run.startZ) * forward.z;
  const drawn = Math.max(0, travelled - gap);

  return {
    x: run.startX + forward.x * drawn,
    z: run.startZ + forward.z * drawn,
  };
}
