// src/utils/storage.test.ts
import {
  loadHighScoreMax,
  loadHighScores,
  loadPlayerName,
  savePlayerName,
  tryInsertHighScore,
} from "./storage";

beforeEach(() => {
  localStorage.clear();
});

describe("player name", () => {
  it("round-trips through localStorage", () => {
    expect(loadPlayerName()).toBeNull();
    savePlayerName("Flynn");
    expect(loadPlayerName()).toBe("Flynn");
  });
});

describe("loadHighScores", () => {
  it("seeds the leaderboard on first load", () => {
    const scores = loadHighScores();
    expect(scores).toHaveLength(5);
    expect(scores[0].score).toBe(50000);
    expect(loadHighScoreMax()).toBe(50000);
  });

  it("falls back to the seed when stored data is corrupt", () => {
    localStorage.setItem("lca.highScores", "not-json{");
    expect(loadHighScores()).toHaveLength(5);
  });

  it("falls back to the seed when stored data is not an array", () => {
    localStorage.setItem("lca.highScores", JSON.stringify({ nope: true }));
    expect(loadHighScores()).toHaveLength(5);
  });
});

describe("tryInsertHighScore", () => {
  it("keeps the list sorted descending", () => {
    const updated = tryInsertHighScore({
      name: "Sam",
      score: 45000,
      dateISO: new Date().toISOString(),
    });
    expect(updated.map((entry) => entry.name).slice(0, 2)).toEqual([
      "Flynn",
      "Sam",
    ]);
    expect([...updated].sort((a, b) => b.score - a.score)).toEqual(updated);
  });

  it("caps the leaderboard at 10 entries", () => {
    for (let i = 0; i < 12; i += 1) {
      tryInsertHighScore({
        name: `P${i}`,
        score: 1000 * i,
        dateISO: new Date().toISOString(),
      });
    }
    expect(loadHighScores()).toHaveLength(10);
  });

  it("updates the cached max score", () => {
    tryInsertHighScore({
      name: "Quorra",
      score: 99999,
      dateISO: new Date().toISOString(),
    });
    expect(loadHighScoreMax()).toBe(99999);
  });
});
