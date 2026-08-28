// src/game/matchState.test.ts
import {
  createInitialMatchState,
  isRoundRunning,
  matchReducer,
} from "./matchState";
import type { MatchAction, MatchState } from "./matchState";
import {
  INITIAL_LIVES,
  LEVEL_COUNT,
  bonusForLevel,
  pointsPerSecond,
} from "../config/levels";

function run(state: MatchState, ...actions: MatchAction[]): MatchState {
  return actions.reduce(matchReducer, state);
}

const menu = createInitialMatchState("2d");
const playing = run(menu, { type: "startRun", matchMode: "solo", renderMode: "2d" });

describe("starting a run", () => {
  it("wipes the slate and starts a round", () => {
    const dirty: MatchState = {
      ...playing,
      level: 4,
      lives: 1,
      score: 9000,
      roundWins: [2, 1],
    };
    const fresh = run(dirty, { type: "startRun", matchMode: "solo", renderMode: "3d" });

    expect(fresh).toMatchObject({
      gameState: "playing",
      isPaused: false,
      level: 1,
      lives: INITIAL_LIVES,
      score: 0,
      roundWins: [0, 0],
      renderMode: "3d",
    });
    expect(fresh.roundToken).toBeGreaterThan(dirty.roundToken);
  });
});

describe("finishing a round", () => {
  it("pays the level bonus for a win and moves on", () => {
    const won = run(playing, { type: "endRound", outcome: "win", message: "" });
    expect(won.score).toBe(bonusForLevel(1));

    const next = run(won, { type: "continueAfterRound" });
    expect(next).toMatchObject({ gameState: "playing", level: 2, lives: INITIAL_LIVES });
    expect(next.roundToken).toBeGreaterThan(won.roundToken);
  });

  it("ends the run in triumph after the last level", () => {
    const lastLevel: MatchState = { ...playing, level: LEVEL_COUNT };
    const finished = run(
      lastLevel,
      { type: "endRound", outcome: "win", message: "" },
      { type: "continueAfterRound" }
    );

    expect(finished).toMatchObject({ gameState: "gameOver", gameOverReason: "victory" });
  });

  it("charges a life for a loss and for a draw alike", () => {
    for (const outcome of ["lose", "draw"] as const) {
      const after = run(
        playing,
        { type: "endRound", outcome, message: "" },
        { type: "continueAfterRound" }
      );

      expect(after.lives).toBe(INITIAL_LIVES - 1);
      expect(after.gameState).toBe("playing");
      expect(after.level).toBe(1);
    }
  });

  it("ends the run when the last life goes", () => {
    const onLastLife: MatchState = { ...playing, lives: 1 };
    const after = run(
      onLastLife,
      { type: "endRound", outcome: "lose", message: "" },
      { type: "continueAfterRound" }
    );

    expect(after).toMatchObject({
      gameState: "gameOver",
      gameOverReason: "outOfLives",
      lives: 0,
    });
  });

  it("ignores a second press once the round is already resolved", () => {
    const gameOver = run(
      { ...playing, lives: 1 },
      { type: "endRound", outcome: "lose", message: "" },
      { type: "continueAfterRound" }
    );

    expect(run(gameOver, { type: "continueAfterRound" })).toBe(gameOver);
  });
});

describe("versus matches", () => {
  const versus = run(menu, { type: "startRun", matchMode: "versus", renderMode: "2d" });

  it("tallies rounds instead of lives and levels", () => {
    const afterTwo = run(
      versus,
      { type: "endRound", outcome: "win", message: "" },
      { type: "continueAfterRound" },
      { type: "endRound", outcome: "lose", message: "" },
      { type: "continueAfterRound" }
    );

    expect(afterTwo.roundWins).toEqual([1, 1]);
    expect(afterTwo.lives).toBe(INITIAL_LIVES);
    expect(afterTwo.level).toBe(1);
    expect(afterTwo.gameState).toBe("playing");
  });

  it("gives a draw to nobody", () => {
    const drawn = run(versus, { type: "endRound", outcome: "draw", message: "" });
    expect(drawn.roundWins).toEqual([0, 0]);
  });

  it("never ends, so it never scores", () => {
    const survived = run(versus, { type: "awardSurvival" }, { type: "awardSurvival" });
    expect(survived.score).toBe(0);
  });
});

describe("survival points", () => {
  it("pays by the level in a solo run", () => {
    expect(run(playing, { type: "awardSurvival" }).score).toBe(pointsPerSecond(1));
  });
});

describe("restarting by hand", () => {
  it("costs the round, so it can't be used to dodge a crash", () => {
    const reset = run(playing, { type: "restartRoundManually" });

    expect(reset.gameState).toBe("roundEnd");
    expect(reset.roundOutcome).toBe("lose");
    expect(run(reset, { type: "continueAfterRound" }).lives).toBe(INITIAL_LIVES - 1);
  });

  it("does nothing outside a live round", () => {
    expect(run(menu, { type: "restartRoundManually" })).toBe(menu);
  });
});

describe("pausing", () => {
  it("only applies to a live round", () => {
    expect(run(playing, { type: "pause" }).isPaused).toBe(true);
    expect(run(menu, { type: "pause" }).isPaused).toBe(false);
    expect(run(playing, { type: "togglePause" }, { type: "togglePause" }).isPaused).toBe(
      false
    );
  });

  it("stops the arena without ending the round", () => {
    const paused = run(playing, { type: "pause" });

    expect(isRoundRunning(paused)).toBe(false);
    expect(paused.gameState).toBe("playing");
    expect(isRoundRunning(run(paused, { type: "resume" }))).toBe(true);
  });
});

describe("leaving to the menu", () => {
  it("clears the board and the last verdict", () => {
    const ended = run(playing, { type: "endRound", outcome: "lose", message: "crashed" });
    const back = run(ended, { type: "backToMenu" });

    expect(back).toMatchObject({
      gameState: "menu",
      roundOutcome: null,
      roundMessage: null,
    });
    expect(back.roundToken).toBeGreaterThan(ended.roundToken);
  });
});
