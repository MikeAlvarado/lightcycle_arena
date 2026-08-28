// src/ai/simpleAI.ts
import type { GridConfig } from "../utils/gridConfig";
import type { LatticeIndex, LatticeMatrix, Direction } from "../utils/latticeHelpers";
import type { Player } from "../types/player";
import {
  stepOnLattice,
  isInsideLattice,
  isOccupied,
  setOccupancy,
} from "../utils/latticeHelpers";

/**
 * AI Difficulty levels.
 * Each difficulty level changes reaction speed, randomness, and lookahead.
 */
export type AiDifficulty = "Easy" | "Normal" | "Hard" | "VeryHard" | "Insane";

/**
 * Parameters that define the AI behavior for a given difficulty.
 */
export interface AiParams {
  /** The number of logic ticks between each decision (higher = slower). Minimum 1 (every tick). */
  decisionEveryNTicks: number;
  /** Probability of choosing a suboptimal (random) move. */
  randomness: number;
  /**
   * How far the bot looks for room to keep riding, in units of
   * SPACE_PER_LOOKAHEAD vertices. 0 means it doesn't look at all and simply
   * picks a safe direction.
   */
  lookahead: number;
  /** 0..1 — how much the bot gives up open space to close in on its rival. */
  aggression: number;
}

/** Vertices explored per unit of lookahead when measuring open space. */
const SPACE_PER_LOOKAHEAD = 45;
/** Tie-break nudge that keeps the bot from weaving when directions score alike. */
const STRAIGHT_LINE_BONUS = 0.5;
/** Distance (in cells) inside which closing in is worth anything. */
const CHASE_RANGE_IN_CELLS = 20;

const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

/**
 * Parameter values for all difficulty levels.
 */
export const AI_PARAMS: Record<AiDifficulty, AiParams> = {
  Easy:     { decisionEveryNTicks: 4, randomness: 0.18, lookahead: 0, aggression: 0 },
  Normal:   { decisionEveryNTicks: 3, randomness: 0.10, lookahead: 1, aggression: 0 },
  Hard:     { decisionEveryNTicks: 2, randomness: 0.05, lookahead: 2, aggression: 0.15 },
  VeryHard: { decisionEveryNTicks: 1, randomness: 0.02, lookahead: 3, aggression: 0.35 },
  Insane:   { decisionEveryNTicks: 1, randomness: 0.00, lookahead: 5, aggression: 0.6 },
};

/**
 * Information available to the AI when making decisions.
 */
export interface AiView {
  grid: GridConfig;
  lattice: LatticeMatrix;
  self: Player;
  opponent?: Player;
}

/**
 * Checks if moving in the given direction is safe.
 */
export function isSafeMove(view: AiView, direction: Direction): boolean {
  const { grid, lattice, self } = view;
  const { traversedEdgeCellInLattice, destinationVertexInLattice } =
    stepOnLattice(self.headLatticeIndex, direction);

  return (
    isInsideLattice(traversedEdgeCellInLattice, grid) &&
    isInsideLattice(destinationVertexInLattice, grid) &&
    !isOccupied(lattice, traversedEdgeCellInLattice) &&
    !isOccupied(lattice, destinationVertexInLattice)
  );
}

/**
 * Returns all safe directions that the AI can move into.
 */
export function getSafeDirections(view: AiView): Direction[] {
  return ALL_DIRECTIONS.filter((dir) => isSafeMove(view, dir));
}

/**
 * How many vertices are still reachable from a starting vertex, counting at
 * most `maxCount` of them.
 *
 * This is what separates a bot that survives from one that rides into a pocket
 * it can never leave: a move into a dead end scores a handful of vertices while
 * a move into open floor hits the cap. The cap is what keeps it cheap — the
 * search stops as soon as the bot knows it has room to spare.
 */
export function countReachableVertices(
  grid: GridConfig,
  lattice: LatticeMatrix,
  startVertex: LatticeIndex,
  maxCount: number
): number {
  if (maxCount <= 0) return 0;

  const latticeWidth = grid.columns * 2 + 1;
  const keyOf = (vertex: LatticeIndex): number =>
    vertex.rowIndexInLattice * latticeWidth + vertex.columnIndexInLattice;

  const visited = new Set<number>([keyOf(startVertex)]);
  const queue: LatticeIndex[] = [startVertex];
  let queueHead = 0;
  let reached = 0;

  while (queueHead < queue.length && reached < maxCount) {
    const current = queue[queueHead];
    queueHead += 1;
    reached += 1;

    for (const direction of ALL_DIRECTIONS) {
      const { traversedEdgeCellInLattice, destinationVertexInLattice } = stepOnLattice(
        current,
        direction
      );

      if (
        !isInsideLattice(traversedEdgeCellInLattice, grid) ||
        !isInsideLattice(destinationVertexInLattice, grid) ||
        isOccupied(lattice, traversedEdgeCellInLattice) ||
        isOccupied(lattice, destinationVertexInLattice)
      ) {
        continue;
      }

      const key = keyOf(destinationVertexInLattice);
      if (visited.has(key)) continue;

      visited.add(key);
      queue.push(destinationVertexInLattice);
    }
  }

  return reached;
}

/** Distance between two lattice vertices, in whole cells. */
function distanceInCells(first: LatticeIndex, second: LatticeIndex): number {
  return (
    Math.abs(first.rowIndexInLattice - second.rowIndexInLattice) / 2 +
    Math.abs(first.columnIndexInLattice - second.columnIndexInLattice) / 2
  );
}

/**
 * Chooses a random element from an array.
 */
function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Rate a candidate move: open space first, then a nudge for riding straight,
 * then — for the meaner difficulties — a nudge for closing in on the rival.
 */
function scoreDirection(view: AiView, direction: Direction, params: AiParams): number {
  const head = view.self.headLatticeIndex;
  const { traversedEdgeCellInLattice, destinationVertexInLattice } = stepOnLattice(
    head,
    direction
  );

  // Ride the move before measuring what is left: the wall the bot is about to
  // lay behind itself is part of the maze it then has to get out of. Without
  // this every dead end looks roomy through the door the bot came in by.
  const edgeWasOccupied = isOccupied(view.lattice, traversedEdgeCellInLattice);
  const headWasOccupied = isOccupied(view.lattice, head);
  setOccupancy(view.lattice, traversedEdgeCellInLattice, true);
  setOccupancy(view.lattice, head, true);

  let score = countReachableVertices(
    view.grid,
    view.lattice,
    destinationVertexInLattice,
    params.lookahead * SPACE_PER_LOOKAHEAD
  );

  setOccupancy(view.lattice, traversedEdgeCellInLattice, edgeWasOccupied);
  setOccupancy(view.lattice, head, headWasOccupied);

  if (direction === view.self.direction) score += STRAIGHT_LINE_BONUS;

  if (params.aggression > 0 && view.opponent) {
    const distance = distanceInCells(
      destinationVertexInLattice,
      view.opponent.headLatticeIndex
    );
    score += params.aggression * Math.max(0, CHASE_RANGE_IN_CELLS - distance);
  }

  return score;
}

/**
 * Decides the next direction based on difficulty.
 */
export function decideNextDirection(
  view: AiView,
  difficulty: AiDifficulty
): Direction {
  const params = AI_PARAMS[difficulty];
  const safeDirections = getSafeDirections(view);

  // No safe options → keep current direction
  if (safeDirections.length === 0) return view.self.direction;

  // Random chance to make a mistake
  if (Math.random() < params.randomness) {
    return pickRandom(safeDirections);
  }

  // The easiest bot doesn't think ahead at all; it just avoids walls.
  if (params.lookahead <= 0) return pickRandom(safeDirections);

  let bestDirection = safeDirections[0];
  let bestScore = -Infinity;

  for (const direction of safeDirections) {
    const score = scoreDirection(view, direction, params);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}
