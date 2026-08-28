// src/game/movement.test.ts
import {
  WALL_DRAIN_PER_TICK,
  advanceRiders,
  describeCrash,
  resolveTickMoves,
} from "./movement";
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

/** A rider as advanceRiders wants it: laying wall, tank full. */
function ridingState(
  rowInCells: number,
  columnInCells: number,
  direction: Direction
): RiderState {
  const base = rider(rowInCells, columnInCells, direction);
  return {
    ...base,
    previousHeadLatticeIndex: base.headLatticeIndex,
    ticksSurvived: 0,
    isLayingWall: true,
    wallEnergy: 1,
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
      ridingState(5, 4, "right"),
      ridingState(1, 1, "down"),
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
      ridingState(5, 4, "right"),
      ridingState(5, 6, "left"),
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
      ridingState(0, 5, "up"),
    ];
    const restingPlace = riders[0].headLatticeIndex;

    expect(advanceRiders(riders, GRID, board.occupancy, board.trails)).toEqual(["arena"]);
    expect(riders[0].headLatticeIndex).toEqual(restingPlace);
    expect(riders[0].previousHeadLatticeIndex).toEqual(restingPlace);

    // A rider that is out stays out and stops being resolved.
    expect(advanceRiders(riders, GRID, board.occupancy, board.trails)).toEqual([null]);
  });
});

describe("cutting the wall", () => {
  function ride(riders: RiderState[], board: ReturnType<typeof makeBoard>, ticks: number) {
    for (let tick = 0; tick < ticks; tick += 1) {
      advanceRiders(riders, GRID, board.occupancy, board.trails);
    }
  }

  it("leaves nothing behind while the wall is off", () => {
    const board = makeBoard();
    const rider = ridingState(5, 5, "right");
    rider.isLayingWall = false;

    const startVertex = rider.headLatticeIndex;
    ride([rider], board, 3);

    const crossedEdge = {
      rowIndexInLattice: startVertex.rowIndexInLattice,
      columnIndexInLattice: startVertex.columnIndexInLattice + 1,
    };
    expect(isOccupied(board.trails[0], crossedEdge)).toBe(false);
    expect(isOccupied(board.occupancy, crossedEdge)).toBe(false);
    // Nor the vertices it passed over, so the gap is a gap both ways.
    expect(isOccupied(board.occupancy, startVertex)).toBe(false);
  });

  it("keeps the wall it had already laid", () => {
    // Switching off stops you leaving more; it does not undo what is there.
    const board = makeBoard();
    const rider = ridingState(5, 5, "right");
    const startVertex = rider.headLatticeIndex;

    ride([rider], board, 2);
    rider.isLayingWall = false;
    ride([rider], board, 2);

    expect(isOccupied(board.occupancy, startVertex)).toBe(true);
    expect(isOccupied(board.trails[0], startVertex)).toBe(true);
  });

  it("lets a rider back through the gap it left", () => {
    const board = makeBoard();
    const rider = ridingState(5, 5, "right");
    rider.isLayingWall = false;
    ride([rider], board, 3);

    // Turn around the long way and ride back over its own path.
    rider.direction = "down";
    ride([rider], board, 1);
    rider.direction = "left";
    ride([rider], board, 1);
    rider.direction = "up";
    const crashes = advanceRiders([rider], GRID, board.occupancy, board.trails);

    expect(crashes[0]).toBeNull();
    expect(rider.isAlive).toBe(true);
  });

  // Draining the tank takes more ticks than the little test arena has room for.
  const LONG_GRID = { rows: 60, columns: 60 };

  function longRun(): { rider: RiderState; board: ReturnType<typeof makeBoard> } {
    return {
      rider: ridingState(30, 2, "right"),
      board: {
        occupancy: createEmptyLattice(LONG_GRID.rows, LONG_GRID.columns),
        trails: [createEmptyLattice(LONG_GRID.rows, LONG_GRID.columns)],
      },
    };
  }

  it("drains while the wall is off and refills while it is on", () => {
    const { rider, board } = longRun();
    rider.isLayingWall = false;

    for (let tick = 0; tick < 5; tick += 1) {
      advanceRiders([rider], LONG_GRID, board.occupancy, board.trails);
    }
    const afterCutting = rider.wallEnergy;
    expect(afterCutting).toBeLessThan(1);

    rider.isLayingWall = true;
    for (let tick = 0; tick < 5; tick += 1) {
      advanceRiders([rider], LONG_GRID, board.occupancy, board.trails);
    }

    expect(rider.isAlive).toBe(true);
    expect(rider.wallEnergy).toBeGreaterThan(afterCutting);
  });

  it("switches the wall back on when the power runs out", () => {
    const { rider, board } = longRun();
    rider.isLayingWall = false;

    // Long enough to empty the tank whatever the drain rate is.
    for (let tick = 0; tick < Math.ceil(1 / WALL_DRAIN_PER_TICK) + 1; tick += 1) {
      advanceRiders([rider], LONG_GRID, board.occupancy, board.trails);
    }

    expect(rider.isAlive).toBe(true);
    expect(rider.isLayingWall).toBe(true);
    // Back on, and already starting to earn the next cut back.
    expect(rider.wallEnergy).toBeLessThan(0.1);
  });
});
