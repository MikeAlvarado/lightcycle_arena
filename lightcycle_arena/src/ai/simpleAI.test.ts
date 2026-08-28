// src/ai/simpleAI.test.ts
import {
  AI_PARAMS,
  countReachableVertices,
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
  const spawnVertex = toLatticeVertexIndices({
    rowIndexInCells: rowInCells,
    columnIndexInCells: columnInCells,
  });

  return {
    id: 2,
    name: "Bot",
    color: "blue",
    headLatticeIndex: spawnVertex,
    previousHeadLatticeIndex: spawnVertex,
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

describe("countReachableVertices", () => {
  it("stops counting once it has seen enough open floor", () => {
    const lattice = createEmptyLattice(GRID.rows, GRID.columns);
    const start = toLatticeVertexIndices({ rowIndexInCells: 5, columnIndexInCells: 5 });

    expect(countReachableVertices(GRID, lattice, start, 50)).toBe(50);
  });

  it("counts a sealed vertex as the one it is standing on", () => {
    const lattice = createEmptyLattice(GRID.rows, GRID.columns);
    const start = toLatticeVertexIndices({ rowIndexInCells: 5, columnIndexInCells: 5 });
    const { rowIndexInLattice: row, columnIndexInLattice: column } = start;

    for (const [rowOffset, columnOffset] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      occupy(lattice, {
        rowIndexInLattice: row + rowOffset,
        columnIndexInLattice: column + columnOffset,
      });
    }

    expect(countReachableVertices(GRID, lattice, start, 50)).toBe(1);
  });

  it("counts a corridor by its length", () => {
    // Wall off every vertical edge so only a single row can be ridden.
    const lattice = createEmptyLattice(GRID.rows, GRID.columns);
    for (let row = 1; row < GRID.rows * 2; row += 2) {
      for (let column = 0; column <= GRID.columns * 2; column += 2) {
        occupy(lattice, { rowIndexInLattice: row, columnIndexInLattice: column });
      }
    }

    const start = toLatticeVertexIndices({ rowIndexInCells: 5, columnIndexInCells: 5 });
    // 11 vertices across a 10-cell wide arena.
    expect(countReachableVertices(GRID, lattice, start, 500)).toBe(GRID.columns + 1);
  });
});

describe("difficulty actually changes how the bot thinks", () => {
  /** Walls the bot in so that only left and right are open. */
  function makeCorridorView(): AiView {
    const player = makePlayer(5, 5);
    const view = makeView(player);
    const { rowIndexInLattice: row, columnIndexInLattice: column } = player.headLatticeIndex;

    occupy(view.lattice, { rowIndexInLattice: row - 1, columnIndexInLattice: column });
    occupy(view.lattice, { rowIndexInLattice: row + 1, columnIndexInLattice: column });

    // Turn the vertex two cells to the right into a dead end.
    occupy(view.lattice, { rowIndexInLattice: row, columnIndexInLattice: column + 3 });
    occupy(view.lattice, { rowIndexInLattice: row - 1, columnIndexInLattice: column + 2 });
    occupy(view.lattice, { rowIndexInLattice: row + 1, columnIndexInLattice: column + 2 });

    return view;
  }

  it("Insane refuses the dead end and takes the open side", () => {
    const view = makeCorridorView();
    expect(getSafeDirections(view).sort()).toEqual(["left", "right"]);
    expect(decideNextDirection(view, "Insane")).toBe("left");
  });

  it("leaves the board exactly as it found it while thinking", () => {
    const view = makeCorridorView();
    const before = JSON.stringify(view.lattice);

    decideNextDirection(view, "Insane");

    expect(JSON.stringify(view.lattice)).toBe(before);
  });

  it("Easy has no idea the dead end is a dead end", () => {
    // It only avoids walls, so over many tries it takes both sides.
    const chosen = new Set<string>();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      chosen.add(decideNextDirection(makeCorridorView(), "Easy"));
    }

    expect(chosen.has("right")).toBe(true);
  });

  it("gets more decisive as the difficulty rises", () => {
    const difficulties: AiDifficulty[] = ["Easy", "Normal", "Hard", "VeryHard", "Insane"];
    const lookaheads = difficulties.map((difficulty) => AI_PARAMS[difficulty].lookahead);
    const mistakes = difficulties.map((difficulty) => AI_PARAMS[difficulty].randomness);

    expect([...lookaheads].sort((a, b) => a - b)).toEqual(lookaheads);
    expect([...mistakes].sort((a, b) => b - a)).toEqual(mistakes);
  });
});
