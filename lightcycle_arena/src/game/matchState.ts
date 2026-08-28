// src/game/matchState.ts
import type {
  GameState,
  MatchMode,
  RenderMode,
  RoundOutcome,
} from "../types/game";
import {
  INITIAL_LIVES,
  LEVEL_COUNT,
  bonusForLevel,
  pointsPerSecond,
} from "../config/levels";

/**
 * Everything about a match that is a rule rather than a side effect.
 *
 * Keeping it in one plain object with one reducer means the awkward questions —
 * does clearing the last level end the run, does a draw cost a life, can a
 * paused round end — are answered in one readable place, and can be tested
 * without a browser anywhere near them.
 */
export interface MatchState {
  gameState: GameState;
  isPaused: boolean;
  matchMode: MatchMode;
  renderMode: RenderMode;
  level: number;
  lives: number;
  score: number;
  /** Rounds taken by each rider in a versus match. */
  roundWins: [number, number];
  roundOutcome: RoundOutcome | null;
  roundMessage: string | null;
  gameOverReason: "victory" | "outOfLives" | "none";
  /**
   * Bumped every time a fresh round starts. The board — lattices, riders, the
   * 3D walls — is cleared by watching this, so "a new round began" is stated
   * once and every listener stays in step.
   */
  roundToken: number;
}

export type MatchAction =
  | { type: "startRun"; matchMode: MatchMode; renderMode: RenderMode }
  | { type: "endRound"; outcome: RoundOutcome; message: string }
  | { type: "continueAfterRound" }
  | { type: "awardSurvival" }
  | { type: "restartRoundManually" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "togglePause" }
  | { type: "backToMenu" }
  | { type: "useRenderMode"; renderMode: RenderMode };

export function createInitialMatchState(renderMode: RenderMode): MatchState {
  return {
    gameState: "menu",
    isPaused: false,
    matchMode: "solo",
    renderMode,
    level: 1,
    lives: INITIAL_LIVES,
    score: 0,
    roundWins: [0, 0],
    roundOutcome: null,
    roundMessage: null,
    gameOverReason: "none",
    roundToken: 0,
  };
}

/** Start of a round: the board is cleared and last round's verdict forgotten. */
function beginRound(state: MatchState, changes: Partial<MatchState>): MatchState {
  return {
    ...state,
    ...changes,
    gameState: "playing",
    isPaused: false,
    roundOutcome: null,
    roundMessage: null,
    roundToken: state.roundToken + 1,
  };
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case "startRun":
      return beginRound(state, {
        matchMode: action.matchMode,
        renderMode: action.renderMode,
        level: 1,
        lives: INITIAL_LIVES,
        score: 0,
        roundWins: [0, 0],
        gameOverReason: "none",
      });

    case "awardSurvival":
      if (state.matchMode === "versus") return state;
      return { ...state, score: state.score + pointsPerSecond(state.level) };

    case "endRound": {
      // A round that is already over can't end again, however many ticks a
      // stalled frame replays in one go.
      if (state.gameState !== "playing") return state;

      const ended: MatchState = {
        ...state,
        gameState: "roundEnd",
        roundOutcome: action.outcome,
        roundMessage: action.message,
      };

      if (state.matchMode === "versus") {
        const [first, second] = state.roundWins;
        ended.roundWins =
          action.outcome === "win"
            ? [first + 1, second]
            : action.outcome === "lose"
              ? [first, second + 1]
              : state.roundWins;
      } else if (action.outcome === "win") {
        ended.score = state.score + bonusForLevel(state.level);
      }

      return ended;
    }

    case "restartRoundManually":
      // Restarting mid-round costs what crashing costs, or nobody would ever
      // take the crash. In versus it simply belongs to neither rider.
      if (state.gameState !== "playing") return state;
      return {
        ...state,
        gameState: "roundEnd",
        isPaused: false,
        roundOutcome: state.matchMode === "versus" ? "draw" : "lose",
        roundMessage:
          state.matchMode === "versus"
            ? "Round reset."
            : "Round reset — life lost.",
      };

    case "continueAfterRound": {
      if (state.gameState !== "roundEnd") return state;

      // A versus match just keeps going; there is nothing to run out of.
      if (state.matchMode === "versus") return beginRound(state, {});

      if (state.roundOutcome === "win") {
        if (state.level >= LEVEL_COUNT) {
          return { ...state, gameState: "gameOver", gameOverReason: "victory" };
        }
        return beginRound(state, { level: state.level + 1 });
      }

      // Losing and drawing both cost a life: a draw the player chose to take
      // must not be cheaper than the crash they were avoiding.
      const remainingLives = state.lives - 1;
      if (remainingLives <= 0) {
        return {
          ...state,
          lives: 0,
          gameState: "gameOver",
          gameOverReason: "outOfLives",
        };
      }

      return beginRound(state, { lives: remainingLives });
    }

    case "pause":
      if (state.gameState !== "playing") return state;
      return { ...state, isPaused: true };

    case "resume":
      return { ...state, isPaused: false };

    case "togglePause":
      if (state.gameState !== "playing") return state;
      return { ...state, isPaused: !state.isPaused };

    case "backToMenu":
      return {
        ...state,
        gameState: "menu",
        isPaused: false,
        roundOutcome: null,
        roundMessage: null,
        roundToken: state.roundToken + 1,
      };

    case "useRenderMode":
      return { ...state, renderMode: action.renderMode };

    default:
      return state;
  }
}

/** True while the arena should be advancing. */
export function isRoundRunning(state: MatchState): boolean {
  return state.gameState === "playing" && !state.isPaused;
}
