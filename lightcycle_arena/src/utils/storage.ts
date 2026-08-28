// src/utils/storage.ts
import type { HighScoreEntry, RenderMode } from "../types/game";

const KEY_PLAYER_NAME = "lca.playerName";
const KEY_HIGHSCORES = "lca.highScores";
const KEY_HIGHSCORE_MAX = "lca.highScoreMax";
const KEY_RENDER_MODE = "lca.renderMode";
const KEY_SOUND = "lca.sound";
const KEY_GLOW = "lca.glow";
const KEY_JET_WALL = "lca.jetWall";

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
  // Private mode and blocked storage both throw; losing the name is harmless.
  try { localStorage.setItem(KEY_PLAYER_NAME, name); } catch { /* not fatal */ }
}

/** Remembers the last arena view chosen from the menu. Defaults to 2D. */
export function loadRenderMode(): RenderMode {
  try { return localStorage.getItem(KEY_RENDER_MODE) === "3d" ? "3d" : "2d"; } catch { return "2d"; }
}
export function saveRenderMode(mode: RenderMode): void {
  try { localStorage.setItem(KEY_RENDER_MODE, mode); } catch { /* not fatal */ }
}

/** Sound is on unless the player turned it off. */
export function loadSoundEnabled(): boolean {
  try { return localStorage.getItem(KEY_SOUND) !== "off"; } catch { return true; }
}
export function saveSoundEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY_SOUND, enabled ? "on" : "off"); } catch { /* not fatal */ }
}

/** The jet wall rule: off unless the player has switched it on. */
export function loadJetWallEnabled(): boolean {
  try { return localStorage.getItem(KEY_JET_WALL) === "on"; } catch { return false; }
}
export function saveJetWallEnabled(enabled: boolean): void {
  try { localStorage.setItem(KEY_JET_WALL, enabled ? "on" : "off"); } catch { /* not fatal */ }
}

/**
 * Bloom in the 3D view, as an opinion rather than a value: null means "nobody
 * said", and the caller decides what this device should do by default. Storing
 * the resolved value instead would freeze a guess made before the window had
 * even settled on its size.
 */
export function loadGlowPreference(): boolean | null {
  try {
    const stored = localStorage.getItem(KEY_GLOW);
    if (stored === "on") return true;
    if (stored === "off") return false;
    return null;
  } catch { return null; }
}
export function saveGlowPreference(enabled: boolean): void {
  try { localStorage.setItem(KEY_GLOW, enabled ? "on" : "off"); } catch { /* not fatal */ }
}

/** Type guard so malformed/tampered localStorage entries can't reach rendering code. */
function isValidHighScoreEntry(value: unknown): value is HighScoreEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    typeof entry.score === "number" &&
    Number.isFinite(entry.score) &&
    typeof entry.dateISO === "string"
  );
}

export function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY_HIGHSCORES);
    if (!raw) {
      localStorage.setItem(KEY_HIGHSCORES, JSON.stringify(SEED_HIGHSCORES));
      localStorage.setItem(KEY_HIGHSCORE_MAX, JSON.stringify(SEED_HIGHSCORES[0].score));
      return [...SEED_HIGHSCORES];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...SEED_HIGHSCORES];
    const validEntries = parsed.filter(isValidHighScoreEntry);
    return validEntries.length ? validEntries : [...SEED_HIGHSCORES];
  } catch {
    return [...SEED_HIGHSCORES];
  }
}
export function saveHighScores(list: HighScoreEntry[]): void {
  try {
    localStorage.setItem(KEY_HIGHSCORES, JSON.stringify(list));
    const max = list.length ? Math.max(...list.map(e => e.score)) : 0;
    localStorage.setItem(KEY_HIGHSCORE_MAX, JSON.stringify(max));
  } catch { /* scores are a nicety; never break the game over storage */ }
}
export function loadHighScoreMax(): number {
  try {
    const raw = localStorage.getItem(KEY_HIGHSCORE_MAX);
    if (!raw) return loadHighScores()[0]?.score ?? 0;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "number" && Number.isFinite(parsed)
      ? parsed
      : loadHighScores()[0]?.score ?? 0;
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
