// src/game/simulation.test.ts
import { arenaSetup, runDuel, runSeries } from "./simulation";
import type { RiderPolicy } from "./simulation";
import type { AiDifficulty } from "../ai/simpleAI";
import { SPAWN_COLUMN_OFFSET_IN_CELLS } from "../config/arena";
import { BOT_ROSTER } from "../config/riders";
import { stepMillisecondsForLevel } from "../config/levels";

/**
 * The bots roll dice, so the whole series runs against a fixed sequence. That
 * makes these numbers a regression test rather than a weather report — and the
 * tables they print are how the ladder gets tuned.
 *
 * Raise the round count for a closer look:
 *   VITE_SIMULATION_ROUNDS=200 npm run simulate
 */
function seedRandom(seed: number): () => void {
  let state = seed;
  const spy = vi.spyOn(Math, "random").mockImplementation(() => {
    // xorshift32: cheap, repeatable, good enough to pick a direction with.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 100000) / 100000;
  });
  return () => spy.mockRestore();
}

const ROUNDS = Number(import.meta.env.VITE_SIMULATION_ROUNDS ?? 20);
const bot = (difficulty: AiDifficulty): RiderPolicy => ({ kind: "bot", difficulty });
const straight: RiderPolicy = { kind: "straight" };

/** Win rate as a percentage of rounds, draws counting for nobody. */
function winRate(challenger: AiDifficulty, defender: AiDifficulty): number {
  return Math.round(runDuel(bot(challenger), bot(defender), ROUNDS).winRate * 100);
}

describe("balance", () => {
  let restoreRandom: () => void;

  beforeEach(() => {
    restoreRandom = seedRandom(0x5eed);
  });
  afterEach(() => {
    restoreRandom();
  });

  it("makes every rung of the ladder harder than the one below it", { timeout: 60_000 }, () => {
    // Against Easy the top rungs all sit near the ceiling, so the ladder is
    // judged against a rival that can actually hold a line.
    const againstHard = BOT_ROSTER.map((profile) => winRate(profile.difficulty, "Hard"));

    const table = BOT_ROSTER.map((profile, index) => {
      const duel = runDuel(bot(profile.difficulty), bot("Easy"), ROUNDS);
      const seconds = (
        (duel.averageTicks * stepMillisecondsForLevel(index + 1)) /
        1000
      ).toFixed(1);

      return {
        level: index + 1,
        rider: profile.name,
        difficulty: profile.difficulty,
        "beats Easy": `${Math.round(duel.winRate * 100)}%`,
        "beats Hard": `${againstHard[index]}%`,
        draws: `${Math.round(duel.drawRate * 100)}%`,
        "avg round": `${seconds}s`,
      };
    });

    console.table(table);

    const [easy, normal, , veryHard, insane] = againstHard;

    // Bottom of the ladder loses to Hard, top of the ladder beats it.
    expect(normal).toBeGreaterThan(easy);
    expect(veryHard).toBeGreaterThan(normal);
    expect(insane).toBeGreaterThan(normal);
    expect(veryHard).toBeGreaterThanOrEqual(50);
  });

  it("makes the nose to nose start a game of chicken, not a coin toss", { timeout: 60_000 }, () => {
    const openings = [SPAWN_COLUMN_OFFSET_IN_CELLS, 3, 6, 9].map((offset) => {
      const summary = runSeries(
        arenaSetup([straight, bot("Normal")], { columnOffsetInCells: offset }),
        ROUNDS
      );

      return {
        "spawn offset (cells)": offset,
        shipped: offset === SPAWN_COLUMN_OFFSET_IN_CELLS ? "yes" : "",
        "head-on rounds": `${Math.round((summary.headOns / summary.rounds) * 100)}%`,
        "reaction time": `${(summary.shortestTicks / 10).toFixed(1)}s`,
        "avg round": `${(summary.averageTicks / 10).toFixed(1)}s`,
      };
    });

    console.table(openings);

    const shipped = runSeries(arenaSetup([straight, bot("Normal")]), ROUNDS);

    /*
     * The riders start nose to nose, so a rider who never turns is going to
     * lose that round — that is the point of the opening. What must not happen
     * is the bot taking itself out along with them: it swerves and cuts across
     * instead, which is a duel the player can win by riding better rather than
     * a trade neither of them survives.
     */
    expect(shipped.headOns / shipped.rounds).toBeLessThan(0.1);
  });
});
