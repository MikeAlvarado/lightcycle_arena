// src/render/worldMapping.test.ts
import {
  WORLD_CELL_SIZE,
  directionToYaw,
  isHorizontal,
  latticeToWorld,
  latticeToWorldX,
  latticeToWorldZ,
  lerp,
  shortestAngleDelta,
  smoothingFactor,
} from "./worldMapping";
import { toLatticeVertexIndices } from "../utils/latticeHelpers";
import type { Direction } from "../utils/latticeHelpers";

const GRID = { rows: 30, columns: 40 };

describe("lattice -> world mapping", () => {
  it("centers the arena on the origin", () => {
    const topLeft = latticeToWorld({ rowIndexInLattice: 0, columnIndexInLattice: 0 }, GRID);
    const bottomRight = latticeToWorld(
      { rowIndexInLattice: GRID.rows * 2, columnIndexInLattice: GRID.columns * 2 },
      GRID
    );

    expect(topLeft).toEqual({ x: -40, z: -30 });
    expect(bottomRight).toEqual({ x: 40, z: 30 });
  });

  it("maps one logical cell to one world cell", () => {
    const vertex = toLatticeVertexIndices({ rowIndexInCells: 3, columnIndexInCells: 5 });
    const next = toLatticeVertexIndices({ rowIndexInCells: 4, columnIndexInCells: 6 });

    expect(latticeToWorldX(next.columnIndexInLattice, GRID) -
      latticeToWorldX(vertex.columnIndexInLattice, GRID)).toBe(WORLD_CELL_SIZE);
    expect(latticeToWorldZ(next.rowIndexInLattice, GRID) -
      latticeToWorldZ(vertex.rowIndexInLattice, GRID)).toBe(WORLD_CELL_SIZE);
  });

  it("keeps rows growing downwards as +Z, so 'up' moves towards -Z", () => {
    const higher = latticeToWorldZ(10, GRID);
    const lower = latticeToWorldZ(12, GRID);
    expect(higher).toBeLessThan(lower);
  });
});

describe("directionToYaw", () => {
  // A model whose local forward is -Z ends up pointing along (-sin, 0, -cos).
  const expectedForward: Record<Direction, { x: number; z: number }> = {
    up: { x: 0, z: -1 },
    down: { x: 0, z: 1 },
    left: { x: -1, z: 0 },
    right: { x: 1, z: 0 },
  };

  it.each(Object.keys(expectedForward) as Direction[])(
    "points the bike along %s",
    (direction) => {
      const yaw = directionToYaw(direction);
      expect(-Math.sin(yaw)).toBeCloseTo(expectedForward[direction].x);
      expect(-Math.cos(yaw)).toBeCloseTo(expectedForward[direction].z);
    }
  );

  it("knows which directions run along X", () => {
    expect(isHorizontal("left")).toBe(true);
    expect(isHorizontal("right")).toBe(true);
    expect(isHorizontal("up")).toBe(false);
    expect(isHorizontal("down")).toBe(false);
  });
});

describe("shortestAngleDelta", () => {
  it("turns the short way around instead of spinning 270 degrees", () => {
    const delta = shortestAngleDelta(directionToYaw("right"), directionToYaw("down"));
    expect(Math.abs(delta)).toBeCloseTo(Math.PI / 2);
  });

  it("stays put when the angle already matches", () => {
    expect(shortestAngleDelta(Math.PI / 3, Math.PI / 3)).toBeCloseTo(0);
  });

  it("never returns more than half a turn", () => {
    for (let from = -Math.PI; from <= Math.PI; from += 0.3) {
      for (let to = -Math.PI; to <= Math.PI; to += 0.3) {
        expect(Math.abs(shortestAngleDelta(from, to))).toBeLessThanOrEqual(Math.PI + 1e-9);
      }
    }
  });
});

describe("interpolation helpers", () => {
  it("lerps between the two ends of a tick", () => {
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("smooths more per frame the longer the frame took", () => {
    const shortFrame = smoothingFactor(10, 1 / 120);
    const longFrame = smoothingFactor(10, 1 / 30);
    expect(shortFrame).toBeGreaterThan(0);
    expect(shortFrame).toBeLessThan(longFrame);
    expect(longFrame).toBeLessThan(1);
  });
});
