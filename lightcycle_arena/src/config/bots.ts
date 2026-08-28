// src/config/bots.ts
import type { AiDifficulty } from "../ai/simpleAI";

/**
 * The rider on the other bike. Each level fields a different one, so the ladder
 * has faces on it rather than a number going up.
 */
export interface BotProfile {
  name: string;
  /** Trail and bike colour. Kept clear of the player's gold on every rung. */
  color: string;
  difficulty: AiDifficulty;
  /** One line shown when the level begins. */
  tagline: string;
}

export const BOT_ROSTER: readonly BotProfile[] = [
  {
    name: "Jarvis",
    color: "#31d7ff",
    difficulty: "Easy",
    tagline: "Herald of the grid. Mostly noise.",
  },
  {
    name: "Castor",
    color: "#a45cff",
    difficulty: "Normal",
    tagline: "Everything is negotiable. Even you.",
  },
  {
    name: "Sark",
    color: "#ff3355",
    difficulty: "Hard",
    tagline: "The Master Control Program is watching.",
  },
  {
    name: "Rinzler",
    color: "#ff4d1a",
    difficulty: "VeryHard",
    tagline: "No words. Just the line.",
  },
  {
    name: "CLU",
    color: "#ff8a00",
    difficulty: "Insane",
    tagline: "I made this world. You are a flaw in it.",
  },
];

/** The rider fielded at a given level, clamped to the roster. */
export function botForLevel(level: number): BotProfile {
  const clamped = Math.max(1, Math.min(level, BOT_ROSTER.length));
  return BOT_ROSTER[clamped - 1];
}

/** Player two in a versus match: a person, not a program. */
export const HUMAN_RIVAL: BotProfile = {
  name: "Cyan",
  color: "#31d7ff",
  difficulty: "Normal",
  tagline: "",
};
