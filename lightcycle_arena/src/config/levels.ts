// src/config/levels.ts
import type { AiDifficulty } from "../ai/simpleAI";

export const INITIAL_LIVES = 3;
export const LEVEL_COUNT = 5;

/** Map level (1..5) -> AI difficulty */
export function difficultyForLevel(level: number): AiDifficulty {
  const table: AiDifficulty[] = ["Easy", "Normal", "Hard", "VeryHard", "Insane"];
  const clamped = Math.max(1, Math.min(level, table.length));
  return table[clamped - 1];
}

/**
 * Bonus awarded when a level is cleared.
 * Stronger scaling so scores feel rewarding per level.
 * L1..L5: 1000, 2000, 3000, 5000, 10000
 */
export function bonusForLevel(level: number): number {
  const table = [1000, 2000, 3000, 5000, 10000];
  const clamped = Math.max(1, Math.min(level, table.length));
  return table[clamped - 1];
}

/**
 * Points gained per survived second while playing.
 * Scales with level to reward higher difficulty.
 * L1..L5: 50, 100, 150, 200, 250 (per second)
 */
export function pointsPerSecond(level: number): number {
  const table = [50, 100, 150, 200, 250];
  const clamped = Math.max(1, Math.min(level, table.length));
  return table[clamped - 1];
}
