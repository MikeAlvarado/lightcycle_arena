// src/types/game.ts

export type GameState = "menu" | "playing" | "roundEnd" | "gameOver";

export interface HighScoreEntry {
  name: string;
  score: number;
  dateISO: string;
}
