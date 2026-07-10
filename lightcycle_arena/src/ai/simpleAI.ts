// src/ai/simpleAI.ts
import type { GridConfig } from "../utils/gridConfig";
import type { LatticeMatrix, Direction } from "../utils/latticeHelpers";
import type { Player } from "../types/player";
import {
  stepOnLattice,
  isInsideLattice,
  isOccupied,
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
  /** How far ahead to check for safety (0 = immediate). */
  lookahead: number;
}

/**
 * Parameter values for all difficulty levels.
 */
export const AI_PARAMS: Record<AiDifficulty, AiParams> = {
  Easy:     { decisionEveryNTicks: 4, randomness: 0.10, lookahead: 1 },
  Normal:   { decisionEveryNTicks: 3, randomness: 0.08, lookahead: 2 },
  Hard:     { decisionEveryNTicks: 2, randomness: 0.05, lookahead: 3 },
  VeryHard: { decisionEveryNTicks: 1, randomness: 0.03, lookahead: 4 },
  Insane:   { decisionEveryNTicks: 1, randomness: 0.01, lookahead: 5 },
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
  const allDirections: Direction[] = ["up", "down", "left", "right"];
  return allDirections.filter((dir) => isSafeMove(view, dir));
}

/**
 * Chooses a random element from an array.
 */
function pickRandom<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
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

  switch (difficulty) {
    case "Easy":
      // Pick a random safe direction
      return pickRandom(safeDirections);

    case "Normal":
      // Keep current direction if safe, else random safe
      if (safeDirections.includes(view.self.direction))
        return view.self.direction;
      return pickRandom(safeDirections);

    case "Hard":
    case "VeryHard":
    case "Insane":
      // Placeholder: prefers "up" > "right" > "down" > "left" if safe
      const preferenceOrder: Direction[] = ["up", "right", "down", "left"];
      for (const dir of preferenceOrder) {
        if (safeDirections.includes(dir)) return dir;
      }
      return pickRandom(safeDirections);
  }
}
