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

  it("falls back to the seed when every entry is malformed", () => {
    localStorage.setItem(
      "lca.highScores",
      JSON.stringify([{ foo: 1 }, { name: "NoScore" }, null, "oops"])
    );
    expect(loadHighScores()).toHaveLength(5);
  });

  it("drops malformed entries but keeps well-formed ones", () => {
    localStorage.setItem(
      "lca.highScores",
      JSON.stringify([
        { name: "Valid", score: 12345, dateISO: "2026-01-01T00:00:00.000Z" },
        { name: "Missing score" },
      ])
    );
    const scores = loadHighScores();
    expect(scores).toHaveLength(1);
    expect(scores[0].name).toBe("Valid");
  });

  it("ignores a non-numeric cached max score and falls back to the highest real entry", () => {
    const probe = [
      { name: "Valid", score: 777, dateISO: "2026-01-01T00:00:00.000Z" },
    ];
    localStorage.setItem("lca.highScoreMax", JSON.stringify("not-a-number"));
    localStorage.setItem("lca.highScores", JSON.stringify(probe));
    expect(loadHighScoreMax()).toBe(777);
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
