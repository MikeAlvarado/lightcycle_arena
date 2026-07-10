// src/utils/latticeHelpers.test.ts
import {
  applyPendingDirection,
  createEmptyLattice,
  isInsideLattice,
  isOccupied,
  occupy,
  stepOnLattice,
  toLatticeVertexIndices,
} from "./latticeHelpers";
import type { Direction } from "./latticeHelpers";

describe("createEmptyLattice", () => {
  it("creates a (2*rows+1) x (2*columns+1) matrix of false", () => {
    const lattice = createEmptyLattice(3, 4);
    expect(lattice).toHaveLength(7);
    expect(lattice[0]).toHaveLength(9);
    expect(lattice.every((row) => row.every((cell) => cell === false))).toBe(true);
  });
});

describe("toLatticeVertexIndices", () => {
  it("doubles cell coordinates onto the lattice", () => {
    expect(
      toLatticeVertexIndices({ rowIndexInCells: 5, columnIndexInCells: 3 })
    ).toEqual({ rowIndexInLattice: 10, columnIndexInLattice: 6 });
  });
});

describe("stepOnLattice", () => {
  const start = { rowIndexInLattice: 10, columnIndexInLattice: 6 };

  it.each<[Direction, number, number, number, number]>([
    ["right", 10, 7, 10, 8],
    ["left", 10, 5, 10, 4],
    ["down", 11, 6, 12, 6],
    ["up", 9, 6, 8, 6],
  ])("moving %s crosses the edge and lands two cells away", (direction, edgeRow, edgeCol, destRow, destCol) => {
    const { traversedEdgeCellInLattice, destinationVertexInLattice } =
      stepOnLattice(start, direction);
    expect(traversedEdgeCellInLattice).toEqual({
      rowIndexInLattice: edgeRow,
      columnIndexInLattice: edgeCol,
    });
    expect(destinationVertexInLattice).toEqual({
      rowIndexInLattice: destRow,
      columnIndexInLattice: destCol,
    });
  });
});

describe("isInsideLattice", () => {
  const grid = { rows: 30, columns: 40 };

  it("accepts inclusive bounds", () => {
    expect(isInsideLattice({ rowIndexInLattice: 0, columnIndexInLattice: 0 }, grid)).toBe(true);
    expect(isInsideLattice({ rowIndexInLattice: 60, columnIndexInLattice: 80 }, grid)).toBe(true);
  });

  it("rejects positions outside the lattice", () => {
    expect(isInsideLattice({ rowIndexInLattice: -1, columnIndexInLattice: 0 }, grid)).toBe(false);
    expect(isInsideLattice({ rowIndexInLattice: 61, columnIndexInLattice: 0 }, grid)).toBe(false);
    expect(isInsideLattice({ rowIndexInLattice: 0, columnIndexInLattice: 81 }, grid)).toBe(false);
  });
});

describe("occupy / isOccupied", () => {
  it("round-trips occupancy", () => {
    const lattice = createEmptyLattice(2, 2);
    const position = { rowIndexInLattice: 1, columnIndexInLattice: 2 };
    expect(isOccupied(lattice, position)).toBe(false);
    occupy(lattice, position);
    expect(isOccupied(lattice, position)).toBe(true);
  });
});

describe("applyPendingDirection", () => {
  function makeRef(direction: Direction, pendingDirection: Direction) {
    return { current: { direction, pendingDirection } };
  }

  it("applies perpendicular turns", () => {
    const ref = makeRef("up", "left");
    applyPendingDirection(ref);
    expect(ref.current.direction).toBe("left");
  });

  it.each<[Direction, Direction]>([
    ["up", "down"],
    ["down", "up"],
    ["left", "right"],
    ["right", "left"],
  ])("blocks the 180° turn %s -> %s", (direction, pending) => {
    const ref = makeRef(direction, pending);
    applyPendingDirection(ref);
    expect(ref.current.direction).toBe(direction);
  });
});
