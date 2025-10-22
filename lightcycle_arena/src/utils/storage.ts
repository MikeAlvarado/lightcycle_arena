// src/utils/storage.ts
import type { HighScoreEntry } from "../types/game";

const KEY_PLAYER_NAME = "lca.playerName";
const KEY_HIGHSCORES = "lca.highScores";
const KEY_HIGHSCORE_MAX = "lca.highScoreMax";

const SEED_HIGHSCORES: HighScoreEntry[] = [
  { name: "Flynn", score: 50000, dateISO: "1982-06-09T00:00:00.000Z" },
  { name: "Tron",  score: 40000, dateISO: "1982-06-09T00:00:00.000Z" },
  { name: "Clu",   score: 30000, dateISO: "1982-06-09T00:00:00.000Z" },
  { name: "Alan",  score: 20000, dateISO: "1982-06-09T00:00:00.000Z" },
  { name: "Yori",  score: 15000, dateISO: "1982-06-09T00:00:00.000Z" },
];

export function loadPlayerName(): string | null {
  try { return localStorage.getItem(KEY_PLAYER_NAME); } catch { return null; }
}
export function savePlayerName(name: string): void {
  try { localStorage.setItem(KEY_PLAYER_NAME, name); } catch {}
}

export function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY_HIGHSCORES);
    if (!raw) {
      localStorage.setItem(KEY_HIGHSCORES, JSON.stringify(SEED_HIGHSCORES));
      localStorage.setItem(KEY_HIGHSCORE_MAX, JSON.stringify(SEED_HIGHSCORES[0].score));
      return [...SEED_HIGHSCORES];
    }
    const parsed = JSON.parse(raw) as HighScoreEntry[];
    return Array.isArray(parsed) ? parsed : [...SEED_HIGHSCORES];
  } catch {
    return [...SEED_HIGHSCORES];
  }
}
export function saveHighScores(list: HighScoreEntry[]): void {
  try {
    localStorage.setItem(KEY_HIGHSCORES, JSON.stringify(list));
    const max = list.length ? Math.max(...list.map(e => e.score)) : 0;
    localStorage.setItem(KEY_HIGHSCORE_MAX, JSON.stringify(max));
  } catch {}
}
export function loadHighScoreMax(): number {
  try {
    const raw = localStorage.getItem(KEY_HIGHSCORE_MAX);
    return raw ? JSON.parse(raw) : loadHighScores()[0]?.score ?? 0;
  } catch { return 0; }
}

/** Insert new score, keep sorted desc, max 10 entries. */
export function tryInsertHighScore(entry: HighScoreEntry): HighScoreEntry[] {
  const list = loadHighScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, 10);
  saveHighScores(trimmed);
  return trimmed;
}
