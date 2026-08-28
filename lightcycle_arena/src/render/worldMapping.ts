// src/render/worldMapping.ts
import type { GridConfig } from "../utils/gridConfig";
import type { Direction, LatticeIndex } from "../utils/latticeHelpers";

/** World units per logical grid cell. */
export const WORLD_CELL_SIZE = 2;

export interface WorldPoint {
  x: number;
  z: number;
}

/**
 * The lattice is a 2x matrix, so a lattice index of 2 is one logical cell.
 * The arena is centered on the origin, which keeps the camera math simple.
 */
export function latticeToWorldX(columnIndexInLattice: number, grid: GridConfig): number {
  return (columnIndexInLattice / 2) * WORLD_CELL_SIZE - (grid.columns * WORLD_CELL_SIZE) / 2;
}

export function latticeToWorldZ(rowIndexInLattice: number, grid: GridConfig): number {
  return (rowIndexInLattice / 2) * WORLD_CELL_SIZE - (grid.rows * WORLD_CELL_SIZE) / 2;
}

export function latticeToWorld(latticeIndex: LatticeIndex, grid: GridConfig): WorldPoint {
  return {
    x: latticeToWorldX(latticeIndex.columnIndexInLattice, grid),
    z: latticeToWorldZ(latticeIndex.rowIndexInLattice, grid),
  };
}

/**
 * 2D rows grow downwards, so "up" is -Z and "down" is +Z.
 */
export const DIRECTION_VECTORS: Record<Direction, WorldPoint> = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};

export function isHorizontal(direction: Direction): boolean {
  return direction === "left" || direction === "right";
}

/**
 * Yaw (rotation around Y) that points a model whose local forward is -Z
 * along the given direction. Rotating (0,0,-1) by yaw gives (-sin, 0, -cos).
 */
export function directionToYaw(direction: Direction): number {
  switch (direction) {
    case "up":
      return 0;
    case "down":
      return Math.PI;
    case "left":
      return Math.PI / 2;
    case "right":
    default:
      return -Math.PI / 2;
  }
}

/**
 * Signed angle to rotate from -> to taking the short way around.
 * Without this a right turn from -PI/2 to PI spins the bike 270 degrees.
 */
export function shortestAngleDelta(fromAngle: number, toAngle: number): number {
  const twoPi = Math.PI * 2;
  let delta = (toAngle - fromAngle) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta < -Math.PI) delta += twoPi;
  return delta;
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

/**
 * Frame-rate independent smoothing factor: the fraction of the remaining
 * distance to cover this frame so that motion looks the same at 30 or 144 fps.
 */
export function smoothingFactor(responsiveness: number, deltaSeconds: number): number {
  return 1 - Math.exp(-responsiveness * deltaSeconds);
}
