// src/ai/simpleAI.test.ts
import {
  AI_PARAMS,
  decideNextDirection,
  getSafeDirections,
  isSafeMove,
} from "./simpleAI";
import type { AiDifficulty, AiView } from "./simpleAI";
import {
  createEmptyLattice,
  occupy,
  toLatticeVertexIndices,
} from "../utils/latticeHelpers";
import type { Player } from "../types/player";

const GRID = { rows: 10, columns: 10 };
const ALL_DIFFICULTIES: AiDifficulty[] = [
  "Easy",
  "Normal",
  "Hard",
  "VeryHard",
  "Insane",
];

function makePlayer(rowInCells: number, columnInCells: number): Player {
  return {
    id: 2,
    name: "Bot",
    color: "blue",
    headLatticeIndex: toLatticeVertexIndices({
      rowIndexInCells: rowInCells,
      columnIndexInCells: columnInCells,
    }),
    direction: "down",
    pendingDirection: "down",
    isAlive: true,
    ticksSurvived: 0,
  };
}

function makeView(player: Player): AiView {
  return {
    grid: GRID,
    lattice: createEmptyLattice(GRID.rows, GRID.columns),
    self: player,
  };
}

describe("AI_PARAMS", () => {
  it("every difficulty decides at least every tick (n % 0 is NaN and would disable the bot)", () => {
    for (const difficulty of ALL_DIFFICULTIES) {
      expect(AI_PARAMS[difficulty].decisionEveryNTicks).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("isSafeMove", () => {
  it("rejects moving out of the arena", () => {
    const view = makeView(makePlayer(0, 5)); // top wall
    expect(isSafeMove(view, "up")).toBe(false);
    expect(isSafeMove(view, "down")).toBe(true);
  });

  it("rejects moving into an occupied edge", () => {
    const player = makePlayer(5, 5);
    const view = makeView(player);
    // Occupy the edge immediately below the head (odd row, even column)
    occupy(view.lattice, {
      rowIndexInLattice: player.headLatticeIndex.rowIndexInLattice + 1,
      columnIndexInLattice: player.headLatticeIndex.columnIndexInLattice,
    });
    expect(isSafeMove(view, "down")).toBe(false);
    expect(isSafeMove(view, "up")).toBe(true);
  });
});

describe("getSafeDirections", () => {
  it("returns all four directions in an open arena", () => {
    const view = makeView(makePlayer(5, 5));
    expect(getSafeDirections(view).sort()).toEqual(
      ["down", "left", "right", "up"].sort()
    );
  });

  it("excludes walls in a corner", () => {
    const view = makeView(makePlayer(0, 0));
    expect(getSafeDirections(view).sort()).toEqual(["down", "right"].sort());
  });
});

describe("decideNextDirection", () => {
  it.each(ALL_DIFFICULTIES)(
    "returns a safe direction on %s when options exist",
    (difficulty) => {
      const view = makeView(makePlayer(5, 5));
      const safe = getSafeDirections(view);
      for (let i = 0; i < 25; i += 1) {
        expect(safe).toContain(decideNextDirection(view, difficulty));
      }
    }
  );

  it("keeps the current direction when nothing is safe", () => {
    const player = makePlayer(5, 5);
    const view = makeView(player);
    for (const direction of ["up", "down", "left", "right"] as const) {
      const { rowIndexInLattice, columnIndexInLattice } = player.headLatticeIndex;
      const deltas = {
        up: [-1, 0],
        down: [1, 0],
        left: [0, -1],
        right: [0, 1],
      } as const;
      occupy(view.lattice, {
        rowIndexInLattice: rowIndexInLattice + deltas[direction][0],
        columnIndexInLattice: columnIndexInLattice + deltas[direction][1],
      });
    }
    expect(decideNextDirection(view, "Hard")).toBe(player.direction);
  });
});
