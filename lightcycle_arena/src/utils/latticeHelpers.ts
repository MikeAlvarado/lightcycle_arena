// src/utils/latticeHelpers.ts

import type { GridConfig } from "./gridConfig";

/**
 * Direction string literal used throughout the lattice stepping logic.
 */
export type Direction = "up" | "down" | "left" | "right";

/**
 * Logical vertex expressed in the original cell grid (not the 2x lattice).
 * - rowIndexInCells:    0..grid.rows
 * - columnIndexInCells: 0..grid.columns
 *
 * Example:
 *   { rowIndexInCells: 5, columnIndexInCells: 3 }
 */
export interface LogicalVertex {
  rowIndexInCells: number;
  columnIndexInCells: number;
}

/**
 * A position inside the 2x lattice matrix (vertices and edges live here).
 * Indices are always absolute indexes in the lattice matrix, not cell space.
 *
 * Parity semantics:
 * - Even,Even   => lattice vertex
 * - Even,Odd    => horizontal edge cell between two vertices
 * - Odd,Even    => vertical   edge cell between two vertices
 * - Odd,Odd     => cell center (unused for trails)
 */
export interface LatticeIndex {
  rowIndexInLattice: number;
  columnIndexInLattice: number;
}

/**
 * Lattice occupancy matrix.
 * true  => occupied (trail or already-visited vertex)
 * false => free
 */
export type LatticeMatrix = boolean[][];

/**
 * Build an empty lattice matrix where all cells are unoccupied.
 * Size: (2*rows + 1) x (2*columns + 1).
 */
export function createEmptyLattice(
  logicalRowCount: number,
  logicalColumnCount: number
): LatticeMatrix {
  const latticeRowCount = logicalRowCount * 2 + 1;
  const latticeColumnCount = logicalColumnCount * 2 + 1;

  return Array.from({ length: latticeRowCount }, () =>
    Array.from({ length: latticeColumnCount }, () => false)
  );
}

/**
 * Map a logical vertex (cell space) to a lattice vertex (even,even).
 * Example:
 *   { rowIndexInCells: 5, columnIndexInCells: 3 } -> { rowIndexInLattice: 10, columnIndexInLattice: 6 }
 */
export function toLatticeVertexIndices(logicalVertex: LogicalVertex): LatticeIndex {
  return {
    rowIndexInLattice: logicalVertex.rowIndexInCells * 2,
    columnIndexInLattice: logicalVertex.columnIndexInCells * 2,
  };
}

/**
 * Given a lattice vertex and a direction, compute:
 * - the lattice edge cell we cross between vertices, and
 * - the destination lattice vertex (also even,even).
 *
 * Assumes the starting vertex indices are even-even.
 */
export function stepOnLattice(
  startingVertexInLattice: LatticeIndex,
  direction: Direction
): { traversedEdgeCellInLattice: LatticeIndex; destinationVertexInLattice: LatticeIndex } {
  const { rowIndexInLattice: startRow, columnIndexInLattice: startColumn } = startingVertexInLattice;

  switch (direction) {
    case "right":
      return {
        traversedEdgeCellInLattice: {
          rowIndexInLattice: startRow,
          columnIndexInLattice: startColumn + 1, // even, odd
        },
        destinationVertexInLattice: {
          rowIndexInLattice: startRow,
          columnIndexInLattice: startColumn + 2, // even, even
        },
      };

    case "left":
      return {
        traversedEdgeCellInLattice: {
          rowIndexInLattice: startRow,
          columnIndexInLattice: startColumn - 1, // even, odd
        },
        destinationVertexInLattice: {
          rowIndexInLattice: startRow,
          columnIndexInLattice: startColumn - 2, // even, even
        },
      };

    case "down":
      return {
        traversedEdgeCellInLattice: {
          rowIndexInLattice: startRow + 1, // odd, even
          columnIndexInLattice: startColumn,
        },
        destinationVertexInLattice: {
          rowIndexInLattice: startRow + 2, // even, even
          columnIndexInLattice: startColumn,
        },
      };

    case "up":
    default:
      return {
        traversedEdgeCellInLattice: {
          rowIndexInLattice: startRow - 1, // odd, even
          columnIndexInLattice: startColumn,
        },
        destinationVertexInLattice: {
          rowIndexInLattice: startRow - 2, // even, even
          columnIndexInLattice: startColumn,
        },
      };
  }
}

/**
 * Check whether a given lattice position is inside the lattice bounds for a GridConfig.
 * Bounds are inclusive.
 */
export function isInsideLattice(
  latticePosition: LatticeIndex,
  grid: GridConfig
): boolean {
  const maxRowIndexInLattice = grid.rows * 2;
  const maxColumnIndexInLattice = grid.columns * 2;

  return (
    latticePosition.rowIndexInLattice >= 0 &&
    latticePosition.rowIndexInLattice <= maxRowIndexInLattice &&
    latticePosition.columnIndexInLattice >= 0 &&
    latticePosition.columnIndexInLattice <= maxColumnIndexInLattice
  );
}

/**
 * Read/Write helpers for lattice occupancy.
 */
export function isOccupied(
  lattice: LatticeMatrix,
  latticePosition: LatticeIndex
): boolean {
  return lattice[latticePosition.rowIndexInLattice][latticePosition.columnIndexInLattice] === true;
}

export function occupy(
  lattice: LatticeMatrix,
  latticePosition: LatticeIndex
): void {
  lattice[latticePosition.rowIndexInLattice][latticePosition.columnIndexInLattice] = true;
}

/**
 * Prevent 180° turns (left<->right, up<->down).
 * Safe to call each tick before stepping.
 */
export function applyPendingDirection<T extends { direction: Direction; pendingDirection: Direction }>(
  playerRef: React.MutableRefObject<T>
): void {
  const { direction, pendingDirection } = playerRef.current;

  const isOppositeDirection =
    (direction === "up" && pendingDirection === "down") ||
    (direction === "down" && pendingDirection === "up") ||
    (direction === "left" && pendingDirection === "right") ||
    (direction === "right" && pendingDirection === "left");

  if (!isOppositeDirection) {
    playerRef.current.direction = pendingDirection;
  }
}
