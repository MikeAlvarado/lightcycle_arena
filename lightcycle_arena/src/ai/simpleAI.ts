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
  /** How far the bot looks, in units of SPACE_PER_LOOKAHEAD vertices. */
  lookahead: number;
}

/** Vertices explored per unit of lookahead when measuring open space. */
const SPACE_PER_LOOKAHEAD = 45;
/** Tie-break nudge that keeps the bot from weaving when directions score alike. */
const STRAIGHT_LINE_BONUS = 0.5;

const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

/**
 * Parameter values for all difficulty levels.
 */
/**
 * Every rider on the grid plays the same game: split the arena and take the
 * bigger half. What separates a warm-up from CLU is how often they look up, how
 * far they see, and how often they get it wrong.
 */
export const AI_PARAMS: Record<AiDifficulty, AiParams> = {
  Easy:     { decisionEveryNTicks: 3, randomness: 0.22, lookahead: 1 },
  Normal:   { decisionEveryNTicks: 2, randomness: 0.14, lookahead: 2 },
  Hard:     { decisionEveryNTicks: 2, randomness: 0.07, lookahead: 3 },
  VeryHard: { decisionEveryNTicks: 1, randomness: 0.02, lookahead: 4 },
  Insane:   { decisionEveryNTicks: 1, randomness: 0.00, lookahead: 6 },
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

/**
 * Split the arena between the two riders and report how it falls out: every
 * vertex goes to whoever reaches it first, and the advantage is what the bot
 * owns minus what its rival owns.
 *
 * This is the difference between a bot that stays alive and one that plays: a
 * move that halves the opponent's half of the arena scores well even when it
 * leaves the bot no more room than the alternatives.
 */
export function territoryAdvantage(
  grid: GridConfig,
  lattice: LatticeMatrix,
  selfVertex: LatticeIndex,
  opponentVertex: LatticeIndex,
  maxVertices: number
): { selfSpace: number; advantage: number } {
  const latticeWidth = grid.columns * 2 + 1;
  const keyOf = (vertex: LatticeIndex): number =>
    vertex.rowIndexInLattice * latticeWidth + vertex.columnIndexInLattice;

  // Both riders flood outwards at the same rate; first to arrive owns the
  // vertex, and the bot is queued first so a tie falls its way.
  const claimed = new Map<number, 0 | 1>([
    [keyOf(selfVertex), 0],
    [keyOf(opponentVertex), 1],
  ]);
  const queue: Array<{ vertex: LatticeIndex; owner: 0 | 1 }> = [
    { vertex: selfVertex, owner: 0 },
    { vertex: opponentVertex, owner: 1 },
  ];

  let queueHead = 0;
  let selfSpace = 0;
  let opponentSpace = 0;

  while (queueHead < queue.length && selfSpace + opponentSpace < maxVertices) {
    const { vertex, owner } = queue[queueHead];
    queueHead += 1;

    if (owner === 0) selfSpace += 1;
    else opponentSpace += 1;

    for (const direction of ALL_DIRECTIONS) {
      const { traversedEdgeCellInLattice, destinationVertexInLattice } = stepOnLattice(
        vertex,
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
      if (claimed.has(key)) continue;

      claimed.set(key, owner);
      queue.push({ vertex: destinationVertexInLattice, owner });
    }
  }

  return { selfSpace, advantage: selfSpace - opponentSpace };
}

/** Vertices the other rider could be standing on after this tick. */
function opponentNextVertices(view: AiView): LatticeIndex[] {
  if (!view.opponent) return [];

  const opponentHead = view.opponent.headLatticeIndex;
  const vertices: LatticeIndex[] = [];

  for (const direction of ALL_DIRECTIONS) {
    const { traversedEdgeCellInLattice, destinationVertexInLattice } = stepOnLattice(
      opponentHead,
      direction
    );

    if (
      isInsideLattice(traversedEdgeCellInLattice, view.grid) &&
      isInsideLattice(destinationVertexInLattice, view.grid) &&
      !isOccupied(view.lattice, traversedEdgeCellInLattice) &&
      !isOccupied(view.lattice, destinationVertexInLattice)
    ) {
      vertices.push(destinationVertexInLattice);
    }
  }

  return vertices;
}

function isSameVertex(first: LatticeIndex, second: LatticeIndex): boolean {
  return (
    first.rowIndexInLattice === second.rowIndexInLattice &&
    first.columnIndexInLattice === second.columnIndexInLattice
  );
}

/** Would riding this way land the bot on a square the rival can also take? */
export function risksHeadOn(view: AiView, direction: Direction): boolean {
  if (!view.opponent) return false;

  const { destinationVertexInLattice } = stepOnLattice(
    view.self.headLatticeIndex,
    direction
  );

  return opponentNextVertices(view).some((vertex) =>
    isSameVertex(vertex, destinationVertexInLattice)
  );
}

/**
 * Bots think on a cadence, and that cadence is most of what makes an easy bot
 * easy. What it should never buy is stupidity: nobody rides into a wall because
 * they weren't due to think yet, and nobody trades themselves for the other
 * rider without looking. Either of those wakes the bot up early.
 */
export function shouldDecideThisTick(
  view: AiView,
  difficulty: AiDifficulty,
  tick: number
): boolean {
  const cadence = Math.max(1, AI_PARAMS[difficulty].decisionEveryNTicks);
  if (tick % cadence === 0) return true;

  return (
    !isSafeMove(view, view.self.direction) || risksHeadOn(view, view.self.direction)
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

  const budget = params.lookahead * SPACE_PER_LOOKAHEAD;

  // Knowing where the rival is turns "how much room have I got" into "how much
  // of the arena is mine", which is the difference between staying alive and
  // shutting the door on somebody.
  const territory = view.opponent
    ? // Twice the budget: the flood is paying for both riders' halves.
      territoryAdvantage(
        view.grid,
        view.lattice,
        destinationVertexInLattice,
        view.opponent.headLatticeIndex,
        budget * 2
      ).advantage
    : countReachableVertices(
        view.grid,
        view.lattice,
        destinationVertexInLattice,
        budget
      );

  setOccupancy(view.lattice, traversedEdgeCellInLattice, edgeWasOccupied);
  setOccupancy(view.lattice, head, headWasOccupied);

  return direction === view.self.direction
    ? territory + STRAIGHT_LINE_BONUS
    : territory;
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

  /*
   * Riding onto a square the other rider can also take kills them both, and
   * neither of them wins a round they are not alive for. So it is ruled out
   * rather than priced in: no score, however good, buys a trade, and the bot
   * only takes one when every other door is shut. This is what makes a nose to
   * nose start a game of chicken instead of a coin toss — and it holds even
   * when the bot is having one of its random moments.
   */
  const withoutTrades = safeDirections.filter(
    (direction) => !risksHeadOn(view, direction)
  );
  const candidates = withoutTrades.length > 0 ? withoutTrades : safeDirections;

  // Random chance to make a mistake
  if (Math.random() < params.randomness) {
    return pickRandom(candidates);
  }

  let bestDirection = candidates[0];
  let bestScore = -Infinity;

  for (const direction of candidates) {
    const score = scoreDirection(view, direction, params);
    if (score > bestScore) {
      bestScore = score;
      bestDirection = direction;
    }
  }

  return bestDirection;
}
