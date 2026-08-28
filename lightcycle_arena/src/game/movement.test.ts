// src/game/movement.test.ts
import { advanceRiders, describeCrash, resolveTickMoves } from "./movement";
import type { MovingPlayer, RiderState } from "./movement";
import {
  createEmptyLattice,
  isOccupied,
  occupy,
  toLatticeVertexIndices,
} from "../utils/latticeHelpers";
import type { Direction, LatticeMatrix } from "../utils/latticeHelpers";

const GRID = { rows: 10, columns: 10 };

function makeBoard() {
  return {
    occupancy: createEmptyLattice(GRID.rows, GRID.columns),
    trails: [
      createEmptyLattice(GRID.rows, GRID.columns),
      createEmptyLattice(GRID.rows, GRID.columns),
    ] as LatticeMatrix[],
  };
}

function rider(rowInCells: number, columnInCells: number, direction: Direction): MovingPlayer {
  return {
    headLatticeIndex: toLatticeVertexIndices({
      rowIndexInCells: rowInCells,
      columnIndexInCells: columnInCells,
    }),
    direction,
    isAlive: true,
  };
}

/** Mark a rider's head the way the game does once it has moved at least once. */
function occupyHead(board: ReturnType<typeof makeBoard>, player: MovingPlayer) {
  occupy(board.occupancy, player.headLatticeIndex);
}

describe("resolveTickMoves", () => {
  it("lets both riders through when their paths don't meet", () => {
    const board = makeBoard();
    const moves = resolveTickMoves(
      [rider(5, 2, "right"), rider(2, 5, "down")],
      GRID,
      board.occupancy,
      board.trails
    );

    expect(moves[0]?.crashed).toBe(false);
    expect(moves[1]?.crashed).toBe(false);
  });

  it("stops a rider at the arena wall", () => {
    const board = makeBoard();
    const moves = resolveTickMoves([rider(0, 5, "up")], GRID, board.occupancy, board.trails);

    expect(moves[0]?.crashed).toBe(true);
    expect(moves[0]?.cause).toBe("arena");
  });

  it("blames the rider's own wall", () => {
    const board = makeBoard();
    const self = rider(5, 5, "right");
    const blockedEdge = {
      rowIndexInLattice: self.headLatticeIndex.rowIndexInLattice,
      columnIndexInLattice: self.headLatticeIndex.columnIndexInLattice + 1,
    };
    occupy(board.occupancy, blockedEdge);
    occupy(board.trails[0], blockedEdge);

    const moves = resolveTickMoves([self], GRID, board.occupancy, board.trails);
    expect(moves[0]?.cause).toBe("ownTrail");
  });

  it("blames the opponent's wall", () => {
    const board = makeBoard();
    const self = rider(5, 5, "right");
    const blockedEdge = {
      rowIndexInLattice: self.headLatticeIndex.rowIndexInLattice,
      columnIndexInLattice: self.headLatticeIndex.columnIndexInLattice + 1,
    };
    occupy(board.occupancy, blockedEdge);
    occupy(board.trails[1], blockedEdge);

    const moves = resolveTickMoves([self, rider(0, 0, "down")], GRID, board.occupancy, board.trails);
    expect(moves[0]?.cause).toBe("opponentTrail");
  });

  it("takes both riders down when they aim at the same vertex", () => {
    // Four cells apart, facing each other: they meet on the vertex in between.
    const board = makeBoard();
    const first = rider(5, 4, "right");
    const second = rider(5, 6, "left");

    const moves = resolveTickMoves([first, second], GRID, board.occupancy, board.trails);

    expect(moves[0]?.crashed).toBe(true);
    expect(moves[1]?.crashed).toBe(true);
    expect(moves[0]?.cause).toBe("headOn");
    expect(moves[1]?.cause).toBe("headOn");
  });

  it("takes both riders down when they try to swap places", () => {
    // Adjacent and facing each other. Heads are on the board, so each rider is
    // riding straight into the other one.
    const board = makeBoard();
    const first = rider(5, 4, "right");
    const second = rider(5, 5, "left");
    occupyHead(board, first);
    occupyHead(board, second);

    const moves = resolveTickMoves([first, second], GRID, board.occupancy, board.trails);

    expect(moves[0]?.crashed).toBe(true);
    expect(moves[1]?.crashed).toBe(true);
    expect(moves[0]?.cause).toBe("headOn");
    expect(moves[1]?.cause).toBe("headOn");
  });

  it("does not resolve moves for riders that are already out", () => {
    const board = makeBoard();
    const out = { ...rider(5, 5, "up"), isAlive: false };

    expect(resolveTickMoves([out], GRID, board.occupancy, board.trails)[0]).toBeNull();
  });

  it("gives the same result whichever order the riders are listed in", () => {
    const board = makeBoard();
    const forwards = resolveTickMoves(
      [rider(5, 4, "right"), rider(5, 6, "left")],
      GRID,
      board.occupancy,
      board.trails
    );
    const backwards = resolveTickMoves(
      [rider(5, 6, "left"), rider(5, 4, "right")],
      GRID,
      board.occupancy,
      board.trails
    );

    expect(forwards.map((move) => move?.crashed)).toEqual([true, true]);
    expect(backwards.map((move) => move?.crashed)).toEqual([true, true]);
  });
});

describe("describeCrash", () => {
  it("names the wall that was hit", () => {
    expect(describeCrash("arena", "You", "Bot")).toContain("arena wall");
    expect(describeCrash("ownTrail", "You", "Bot")).toContain("their own wall");
    expect(describeCrash("opponentTrail", "You", "Bot")).toContain("Bot's wall");
    expect(describeCrash("headOn", "You", "Bot")).toContain("head-on");
  });
});

describe("advanceRiders", () => {
  function makeRiders(): RiderState[] {
    return [
      { ...rider(5, 4, "right"), previousHeadLatticeIndex: rider(5, 4, "right").headLatticeIndex, ticksSurvived: 0 },
      { ...rider(1, 1, "down"), previousHeadLatticeIndex: rider(1, 1, "down").headLatticeIndex, ticksSurvived: 0 },
    ];
  }

  it("moves the riders and lays their walls behind them", () => {
    const board = makeBoard();
    const riders = makeRiders();
    const startVertex = riders[0].headLatticeIndex;

    const crashes = advanceRiders(riders, GRID, board.occupancy, board.trails);

    expect(crashes).toEqual([null, null]);
    expect(riders[0].previousHeadLatticeIndex).toEqual(startVertex);
    expect(riders[0].headLatticeIndex.columnIndexInLattice).toBe(
      startVertex.columnIndexInLattice + 2
    );
    expect(riders[0].ticksSurvived).toBe(1);

    // The wall is the edge it crossed; the trail never holds the live head.
    expect(isOccupied(board.trails[0], {
      rowIndexInLattice: startVertex.rowIndexInLattice,
      columnIndexInLattice: startVertex.columnIndexInLattice + 1,
    })).toBe(true);
    expect(isOccupied(board.trails[0], riders[0].headLatticeIndex)).toBe(false);
  });

  it("blocks the vertex a rider is standing on", () => {
    // This is what stops two riders sharing a vertex: the head is on the board
    // the moment it gets there, not only once the rider leaves it.
    const board = makeBoard();
    const riders = makeRiders();

    advanceRiders(riders, GRID, board.occupancy, board.trails);

    expect(isOccupied(board.occupancy, riders[0].headLatticeIndex)).toBe(true);
  });

  it("never lets two riders finish a tick on the same vertex", () => {
    const board = makeBoard();
    const riders: RiderState[] = [
      { ...rider(5, 4, "right"), previousHeadLatticeIndex: rider(5, 4, "right").headLatticeIndex, ticksSurvived: 0 },
      { ...rider(5, 6, "left"), previousHeadLatticeIndex: rider(5, 6, "left").headLatticeIndex, ticksSurvived: 0 },
    ];

    // Ride them at each other until somebody goes down.
    let crashes = advanceRiders(riders, GRID, board.occupancy, board.trails);
    let ticks = 0;
    while (crashes.every((crash) => crash === null) && ticks < 10) {
      crashes = advanceRiders(riders, GRID, board.occupancy, board.trails);
      ticks += 1;
      expect(riders[0].headLatticeIndex).not.toEqual(riders[1].headLatticeIndex);
    }

    // Head-on: both of them, not just whoever was resolved second.
    expect(crashes).toEqual(["headOn", "headOn"]);
    expect(riders[0].isAlive).toBe(false);
    expect(riders[1].isAlive).toBe(false);
  });

  it("leaves a downed rider where it fell", () => {
    const board = makeBoard();
    const riders: RiderState[] = [
      { ...rider(0, 5, "up"), previousHeadLatticeIndex: rider(0, 5, "up").headLatticeIndex, ticksSurvived: 0 },
    ];
    const restingPlace = riders[0].headLatticeIndex;

    expect(advanceRiders(riders, GRID, board.occupancy, board.trails)).toEqual(["arena"]);
    expect(riders[0].headLatticeIndex).toEqual(restingPlace);
    expect(riders[0].previousHeadLatticeIndex).toEqual(restingPlace);

    // A rider that is out stays out and stops being resolved.
    expect(advanceRiders(riders, GRID, board.occupancy, board.trails)).toEqual([null]);
  });
});
