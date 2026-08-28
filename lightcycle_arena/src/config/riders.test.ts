// src/config/riders.test.ts
import { BOT_ROSTER, HUMAN_RIVAL, PLAYER_PROFILE, botForLevel } from "./riders";
import { LEVEL_COUNT } from "./levels";

function toRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * Redmean distance: a cheap approximation of how different two colours look,
 * which is a great deal closer to the truth than comparing hex strings.
 * Runs 0..765; anything under about 100 reads as "the same colour, roughly".
 */
function colorDistance(first: string, second: string): number {
  const [firstRed, firstGreen, firstBlue] = toRgb(first);
  const [secondRed, secondGreen, secondBlue] = toRgb(second);

  const meanRed = (firstRed + secondRed) / 2;
  const deltaRed = firstRed - secondRed;
  const deltaGreen = firstGreen - secondGreen;
  const deltaBlue = firstBlue - secondBlue;

  return Math.sqrt(
    (2 + meanRed / 256) * deltaRed ** 2 +
      4 * deltaGreen ** 2 +
      (2 + (255 - meanRed) / 256) * deltaBlue ** 2
  );
}

const MINIMUM_DISTANCE_FROM_PLAYER = 120;

describe("the roster", () => {
  it("fields a rider for every level, in difficulty order", () => {
    expect(BOT_ROSTER).toHaveLength(LEVEL_COUNT);
    expect(BOT_ROSTER.map((rider) => rider.name)).toEqual([
      "Jarvis",
      "Castor",
      "Sark",
      "Rinzler",
      "CLU",
    ]);
    expect(botForLevel(1).name).toBe("Jarvis");
    expect(botForLevel(LEVEL_COUNT).name).toBe("CLU");
  });

  it("clamps anything outside the roster instead of returning nothing", () => {
    expect(botForLevel(0)).toBe(botForLevel(1));
    expect(botForLevel(99)).toBe(botForLevel(LEVEL_COUNT));
  });

  it("gives every rider a colour you can tell from your own", () => {
    // The whole game is reading walls at speed. A rival whose colour sits near
    // the player's gold is a rival you crash into by mistake.
    const distances = [...BOT_ROSTER, HUMAN_RIVAL].map((rider) => ({
      rider: rider.name,
      color: rider.color,
      "distance from player": Math.round(colorDistance(rider.color, PLAYER_PROFILE.color)),
    }));

    console.table(distances);

    for (const entry of distances) {
      expect(entry["distance from player"]).toBeGreaterThan(MINIMUM_DISTANCE_FROM_PLAYER);
    }
  });

  it("writes every colour as a six digit hex, which three.js and canvas both read", () => {
    for (const rider of [PLAYER_PROFILE, HUMAN_RIVAL, ...BOT_ROSTER]) {
      expect(rider.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
