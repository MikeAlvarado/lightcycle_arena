// src/utils/latticeHelpers.js

/**
 * Lattice (2x) helpers
 * --------------------
 * We represent both vertices and edges in a single boolean matrix:
 *   latticeRows = 2*rows + 1
 *   latticeCols = 2*columns + 1
 *
 * Parity meaning:
 * - Even,Even   => vertex
 * - Even,Odd    => horizontal edge between two vertices
 * - Odd,Even    => vertical edge between two vertices
 * - Odd,Odd     => cell center (unused in this model)
 */

/**
 * Build an empty lattice matrix (all false = unoccupied).
 */
export function createEmptyLattice(rows, columns) {
  const latticeRows = rows * 2 + 1;
  const latticeCols = columns * 2 + 1;
  return Array.from({ length: latticeRows }, () =>
    Array.from({ length: latticeCols }, () => false)
  );
}

/**
 * Map a logical vertex (cell-space: {row, column}) to lattice indices.
 * Example: {row: 5, column: 3} -> {r: 10, c: 6}
 */
export function toLatticeVertexIndices(logical) {
  return { r: logical.row * 2, c: logical.column * 2 };
}

/**
 * Given a lattice vertex and a direction, compute:
 * - the lattice edge cell passed between vertices
 * - the destination lattice vertex
 */
export function stepOnLattice(fromVertex, direction) {
  // fromVertex is in lattice coords with even-even indices
  if (direction === 'right') {
    return {
      edge: { r: fromVertex.r, c: fromVertex.c + 1 }, // even, odd
      dest: { r: fromVertex.r, c: fromVertex.c + 2 }, // even, even
    };
  }
  if (direction === 'left') {
    return {
      edge: { r: fromVertex.r, c: fromVertex.c - 1 }, // even, odd
      dest: { r: fromVertex.r, c: fromVertex.c - 2 }, // even, even
    };
  }
  if (direction === 'down') {
    return {
      edge: { r: fromVertex.r + 1, c: fromVertex.c }, // odd, even
      dest: { r: fromVertex.r + 2, c: fromVertex.c }, // even, even
    };
  }
  // "up"
  return {
    edge: { r: fromVertex.r - 1, c: fromVertex.c }, // odd, even
    dest: { r: fromVertex.r - 2, c: fromVertex.c }, // even, even
  };
}

/**
 * Bounds checks for lattice cells and vertices.
 */
export function isInsideLattice(cell, grid) {
  const maxR = grid.rows * 2;
  const maxC = grid.columns * 2;
  return cell.r >= 0 && cell.r <= maxR && cell.c >= 0 && cell.c <= maxC;
}

/**
 * Occupancy helpers
 */
export function isOccupied(lattice, cell) {
  return lattice[cell.r][cell.c] === true;
}
export function occupy(lattice, cell) {
  lattice[cell.r][cell.c] = true;
}

/**
 * Prevent 180° turns.
 */
export function applyPendingDirection(playerRef) {
  const { direction, pendingDirection } = playerRef.current;
  const isOpposite =
    (direction === 'up' && pendingDirection === 'down') ||
    (direction === 'down' && pendingDirection === 'up') ||
    (direction === 'left' && pendingDirection === 'right') ||
    (direction === 'right' && pendingDirection === 'left');
  if (!isOpposite) {
    playerRef.current.direction = pendingDirection;
  }
}
