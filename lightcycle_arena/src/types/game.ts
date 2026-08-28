// src/types/game.ts

export type GameState = "menu" | "playing" | "roundEnd" | "gameOver";

/** Which view the arena is drawn with: flat 2D board or 3D cockpit chase. */
export type RenderMode = "2d" | "3d";

export interface HighScoreEntry {
  name: string;
  score: number;
  dateISO: string;
}
