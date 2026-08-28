// src/game/simulation.ts
import type { AiDifficulty } from "../ai/simpleAI";
import type { GridConfig } from "../utils/gridConfig";
import type { Direction, LogicalVertex } from "../utils/latticeHelpers";
import type { Player } from "../types/player";
import type { CrashCause } from "./movement";

import { decideNextDirection, shouldDecideThisTick } from "../ai/simpleAI";
import {
  PLAYER_SPAWN,
  PLAYER_START_DIRECTION,
  RIVAL_SPAWN,
  RIVAL_START_DIRECTION,
  SPAWN_COLUMN_OFFSET_IN_CELLS,
} from "../config/arena";
import { GRID_CONFIG } from "../utils/gridConfig";
import {
  applyPendingDirection,
  createEmptyLattice,
  toLatticeVertexIndices,
} from "../utils/latticeHelpers";
import { advanceRiders } from "./movement";

/**
 * Playing the game without a browser, so balance can be measured instead of
 * guessed at. Everything the arena does per tick is already pure, so a round
 * here runs exactly as it would on screen.
 */
export type RiderPolicy =
  | { kind: "bot"; difficulty: AiDifficulty }
  /** Never turns. Stands in for the player in the opening seconds of a round. */
  | { kind: "straight" };

export interface SimulationSetup {
  grid: GridConfig;
  policies: [RiderPolicy, RiderPolicy];
  spawns: [LogicalVertex, LogicalVertex];
  directions: [Direction, Direction];
  maxTicks: number;
}

export interface RoundResult {
  ticks: number;
  crashes: Array<CrashCause | null>;
  /** Who was left standing, from the first rider's point of view. */
  outcome: "first" | "second" | "draw" | "timeout";
}

function makeRider(
  id: number,
  spawn: LogicalVertex,
  direction: Direction
): Player {
  const vertex = toLatticeVertexIndices(spawn);

  return {
    id,
    name: `Rider ${id}`,
    color: "#ffffff",
    headLatticeIndex: vertex,
    previousHeadLatticeIndex: vertex,
    direction,
    pendingDirection: direction,
    isAlive: true,
    ticksSurvived: 0,
    isLayingWall: true,
    wallEnergy: 1,
  };
}

export function simulateRound(setup: SimulationSetup): RoundResult {
  const { grid, policies, spawns, directions, maxTicks } = setup;

  const occupancy = createEmptyLattice(grid.rows, grid.columns);
  const trails = [
    createEmptyLattice(grid.rows, grid.columns),
    createEmptyLattice(grid.rows, grid.columns),
  ];
  const riders = [
    makeRider(1, spawns[0], directions[0]),
    makeRider(2, spawns[1], directions[1]),
  ];

  for (let tick = 0; tick < maxTicks; tick += 1) {
    riders.forEach((rider, index) => {
      const policy = policies[index];
      if (policy.kind !== "bot") return;

      const view = {
        grid,
        lattice: occupancy,
        self: rider,
        opponent: riders[1 - index],
      };

      if (!shouldDecideThisTick(view, policy.difficulty, tick)) return;
      rider.pendingDirection = decideNextDirection(view, policy.difficulty);
    });

    for (const rider of riders) applyPendingDirection({ current: rider });

    const crashes = advanceRiders(riders, grid, occupancy, trails);

    if (crashes[0] || crashes[1]) {
      return {
        ticks: tick + 1,
        crashes,
        outcome: crashes[0] && crashes[1] ? "draw" : crashes[0] ? "second" : "first",
      };
    }
  }

  return { ticks: maxTicks, crashes: [null, null], outcome: "timeout" };
}

/** The arena as the game actually sets it up, with the spawns as a variable. */
export function arenaSetup(
  policies: [RiderPolicy, RiderPolicy],
  options: { columnOffsetInCells?: number; maxTicks?: number } = {}
): SimulationSetup {
  const offset = options.columnOffsetInCells ?? SPAWN_COLUMN_OFFSET_IN_CELLS;
  const middleColumn = Math.floor(GRID_CONFIG.columns / 2);

  return {
    grid: GRID_CONFIG,
    policies,
    spawns: [
      {
        columnIndexInCells: middleColumn - offset,
        rowIndexInCells: PLAYER_SPAWN.rowIndexInCells,
      },
      {
        columnIndexInCells: middleColumn + offset,
        rowIndexInCells: RIVAL_SPAWN.rowIndexInCells,
      },
    ],
    directions: [PLAYER_START_DIRECTION, RIVAL_START_DIRECTION],
    maxTicks: options.maxTicks ?? 1500,
  };
}

export interface SeriesSummary {
  rounds: number;
  firstWins: number;
  secondWins: number;
  draws: number;
  timeouts: number;
  headOns: number;
  averageTicks: number;
  shortestTicks: number;
}

export function summarise(results: RoundResult[]): SeriesSummary {
  const total = results.length;
  const ticks = results.map((result) => result.ticks);

  return {
    rounds: total,
    firstWins: results.filter((result) => result.outcome === "first").length,
    secondWins: results.filter((result) => result.outcome === "second").length,
    draws: results.filter((result) => result.outcome === "draw").length,
    timeouts: results.filter((result) => result.outcome === "timeout").length,
    headOns: results.filter((result) => result.crashes.includes("headOn")).length,
    averageTicks: total ? Math.round(ticks.reduce((sum, value) => sum + value, 0) / total) : 0,
    shortestTicks: total ? Math.min(...ticks) : 0,
  };
}

/**
 * How often the first policy beats the second, playing half the rounds from
 * each seat.
 *
 * The two spawns are mirror images but the arena is not perfectly even-handed —
 * ties break the same way for both riders, which quietly favours one seat. Any
 * comparison between two policies has to swap seats or it measures the seat.
 */
export function runDuel(
  first: RiderPolicy,
  second: RiderPolicy,
  rounds: number
): { winRate: number; drawRate: number; averageTicks: number } {
  const halfRounds = Math.max(1, Math.round(rounds / 2));
  const asFirst = runSeries(arenaSetup([first, second]), halfRounds);
  const asSecond = runSeries(arenaSetup([second, first]), halfRounds);

  const total = asFirst.rounds + asSecond.rounds;
  const wins = asFirst.firstWins + asSecond.secondWins;
  const draws = asFirst.draws + asSecond.draws;

  return {
    winRate: wins / total,
    drawRate: draws / total,
    averageTicks: Math.round(
      (asFirst.averageTicks * asFirst.rounds + asSecond.averageTicks * asSecond.rounds) /
        total
    ),
  };
}

export function runSeries(setup: SimulationSetup, rounds: number): SeriesSummary {
  const results: RoundResult[] = [];
  for (let round = 0; round < rounds; round += 1) results.push(simulateRound(setup));
  return summarise(results);
}
