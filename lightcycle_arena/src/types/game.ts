// src/types/game.ts

export type GameState = "menu" | "playing" | "roundEnd" | "gameOver";

/** Which view the arena is drawn with: flat 2D board or 3D cockpit chase. */
export type RenderMode = "2d" | "3d";

/** Who rides the second bike: the AI, or a second person on the same keyboard. */
export type MatchMode = "solo" | "versus";

/** How a round ended, always from player one's point of view. */
export type RoundOutcome = "win" | "lose" | "draw";

export interface HighScoreEntry {
  name: string;
  score: number;
  dateISO: string;
}
