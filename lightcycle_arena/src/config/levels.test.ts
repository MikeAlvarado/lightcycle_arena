// src/config/levels.test.ts
import {
  LEVEL_COUNT,
  bonusForLevel,
  difficultyForLevel,
  pointsPerSecond,
  stepMillisecondsForLevel,
  ticksPerSecondAtLevel,
} from "./levels";

const LEVELS = Array.from({ length: LEVEL_COUNT }, (_, index) => index + 1);

describe("level progression", () => {
  it("gets harder, faster and more rewarding every level", () => {
    const bonuses = LEVELS.map(bonusForLevel);
    const points = LEVELS.map(pointsPerSecond);
    const steps = LEVELS.map(stepMillisecondsForLevel);

    expect([...bonuses].sort((a, b) => a - b)).toEqual(bonuses);
    expect([...points].sort((a, b) => a - b)).toEqual(points);
    expect([...steps].sort((a, b) => b - a)).toEqual(steps);
  });

  it("clamps anything outside the level range instead of returning undefined", () => {
    for (const outOfRange of [-3, 0, LEVEL_COUNT + 1, 99]) {
      expect(Number.isFinite(bonusForLevel(outOfRange))).toBe(true);
      expect(Number.isFinite(pointsPerSecond(outOfRange))).toBe(true);
      expect(stepMillisecondsForLevel(outOfRange)).toBeGreaterThan(0);
      expect(difficultyForLevel(outOfRange)).toBeTruthy();
    }

    expect(bonusForLevel(0)).toBe(bonusForLevel(1));
    expect(stepMillisecondsForLevel(99)).toBe(stepMillisecondsForLevel(LEVEL_COUNT));
  });

  it("keeps a tick budget that adds up to about a second", () => {
    for (const level of LEVELS) {
      const ticks = ticksPerSecondAtLevel(level);
      expect(ticks * stepMillisecondsForLevel(level)).toBeGreaterThanOrEqual(900);
      expect(ticks * stepMillisecondsForLevel(level)).toBeLessThanOrEqual(1100);
    }
  });

  it("walks the difficulty ladder from Easy to Insane", () => {
    expect(LEVELS.map(difficultyForLevel)).toEqual([
      "Easy",
      "Normal",
      "Hard",
      "VeryHard",
      "Insane",
    ]);
  });
});
