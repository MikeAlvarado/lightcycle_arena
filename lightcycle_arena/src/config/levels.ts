// src/config/levels.ts
import type { AiDifficulty } from "../ai/simpleAI";
import { BOT_ROSTER, botForLevel } from "./bots";

export const INITIAL_LIVES = 3;
export const LEVEL_COUNT = BOT_ROSTER.length;

/** Map level (1..5) -> AI difficulty, by way of whoever rides at that level. */
export function difficultyForLevel(level: number): AiDifficulty {
  return botForLevel(level).difficulty;
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

/**
 * Tick length per level, in milliseconds.
 * A smarter bot is only half of what makes a later level harder; the arena
 * getting faster is the other half.
 * L1..L5: 110, 100, 90, 80, 70
 */
export function stepMillisecondsForLevel(level: number): number {
  const table = [110, 100, 90, 80, 70];
  const clamped = Math.max(1, Math.min(level, table.length));
  return table[clamped - 1];
}

/**
 * How many ticks make up a second at a given level's speed, so survival points
 * stay "per second" instead of drifting as the arena speeds up.
 */
export function ticksPerSecondAtLevel(level: number): number {
  return Math.max(1, Math.round(1000 / stepMillisecondsForLevel(level)));
}
