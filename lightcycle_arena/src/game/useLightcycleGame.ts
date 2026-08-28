// src/game/useLightcycleGame.ts
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { RefObject } from "react";

import type { HighScoreEntry, MatchMode, RenderMode } from "../types/game";
import type { Player, PlayerForInput } from "../types/player";
import type { Direction, LatticeMatrix } from "../utils/latticeHelpers";
import type { PlayerRenderView, RenderFrame } from "../render/types";
import type { KeyboardControls } from "../utils/inputHandlers";
import type { SteeringMode } from "../utils/steering";
import type { RiderProfile } from "../config/riders";
import type { MatchState } from "./matchState";

import {
  PLAYER_SPAWN,
  PLAYER_START_DIRECTION,
  RIVAL_SPAWN,
  RIVAL_START_DIRECTION,
} from "../config/arena";
import { HUMAN_RIVAL, PLAYER_PROFILE, botForLevel } from "../config/riders";
import {
  LEVEL_COUNT,
  stepMillisecondsForLevel,
  ticksPerSecondAtLevel,
} from "../config/levels";
import { GRID_CONFIG } from "../utils/gridConfig";
import {
  applyPendingDirection,
  createEmptyLattice,
  toLatticeVertexIndices,
} from "../utils/latticeHelpers";
import { advanceRiders, describeCrash } from "./movement";
import { createInitialMatchState, isRoundRunning, matchReducer } from "./matchState";
import { handleKeyDown } from "../utils/inputHandlers";
import { resolveSteering } from "../utils/steering";
import {
  decideNextDirection,
  shouldCutWall,
  shouldDecideThisTick,
} from "../ai/simpleAI";
import { getSoundEngine } from "../audio/soundEngine";
import { loadThreeRenderer } from "../render/loadThreeRenderer";
import { useArenaRenderers } from "../render/useArenaRenderers";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  loadGlowPreference,
  loadHighScoreMax,
  loadJetWallEnabled,
  loadHighScores,
  loadPlayerName,
  loadRenderMode,
  loadSoundEnabled,
  saveGlowPreference,
  saveJetWallEnabled,
  savePlayerName,
  saveRenderMode,
  saveSoundEnabled,
  tryInsertHighScore,
} from "../utils/storage";

/** Everything the UI needs, and nothing it has to know how to compute. */
export interface LightcycleGame {
  state: MatchState;
  /** Whoever is on the other bike right now. */
  opponent: RiderProfile;
  playerLabel: string;
  playerColor: string;
  steeringMode: SteeringMode;
  isMobile: boolean;

  playerName: string | null;
  highScore: number;
  leaderboard: HighScoreEntry[];
  needsNameForSave: boolean;

  soundEnabled: boolean;
  glowEnabled: boolean;
  /** The jet wall rule: riders can switch their wall off and leave a gap. */
  jetWallEnabled: boolean;
  /** Player one's remaining cut, 0..100, for the meter. */
  wallEnergyPercent: number;
  isPlayerCuttingWall: boolean;

  canvasRef: RefObject<HTMLCanvasElement | null>;
  minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
  canvasKey: string;

  actions: {
    startRun: (matchMode: MatchMode, renderMode: RenderMode) => void;
    playAgain: () => void;
    continueAfterRound: () => void;
    restartRound: () => void;
    togglePause: () => void;
    resume: () => void;
    backToMenu: () => void;
    steer: (direction: Direction) => void;
    toggleSound: () => void;
    toggleGlow: () => void;
    toggleJetWall: () => void;
    cutWall: () => void;
    saveScoreAs: (name: string) => void;
    requestNameChange: () => void;
    prefetchCockpit: () => void;
  };
}

/**
 * The game itself: rules by way of the match reducer, a board of lattices and
 * riders in refs, and the effects that connect them to a keyboard, a speaker
 * and a screen.
 *
 * The board lives in refs on purpose. It changes ten times a second or more and
 * nothing in the UI renders from it directly, so putting it in state would mean
 * re-rendering the whole tree for every step of every bike.
 */
export function useLightcycleGame(): LightcycleGame {
  const isMobile = useIsMobile();
  const sound = useMemo(() => getSoundEngine(), []);

  const [state, dispatch] = useReducer(matchReducer, undefined, () =>
    createInitialMatchState(loadRenderMode())
  );

  const [playerName, setPlayerName] = useState<string | null>(loadPlayerName);
  const [highScore, setHighScore] = useState<number>(loadHighScoreMax);
  const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>(loadHighScores);
  const [needsNameForSave, setNeedsNameForSave] = useState<boolean>(false);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(loadSoundEnabled);
  const [jetWallEnabled, setJetWallEnabled] = useState<boolean>(loadJetWallEnabled);
  // Coarse copy of player one's tank, stepped in twentieths so the meter can
  // live in React without re-rendering the tree on every tick.
  const [wallEnergyPercent, setWallEnergyPercent] = useState<number>(100);
  const [isPlayerCuttingWall, setIsPlayerCuttingWall] = useState<boolean>(false);
  // Kept as an opinion, not a value: with nobody's opinion on file the glow
  // follows the device, and follows it again if the device changes its mind.
  const [glowPreference, setGlowPreference] = useState<boolean | null>(loadGlowPreference);
  const glowEnabled = glowPreference ?? !isMobile;

  const opponent = state.matchMode === "versus" ? HUMAN_RIVAL : botForLevel(state.level);

  /**
   * Looking down at the board, a key press is a compass heading. Riding behind
   * the bike it has to be a turn instead, or steering inverts every time the
   * bike faces south. Player two always rides the flat board.
   */
  const steeringMode: SteeringMode = state.renderMode === "3d" ? "relative" : "absolute";

  // The board.
  const occupancyRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );
  const playerTrailRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );
  const rivalTrailRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );
  const tickCounterRef = useRef<number>(0);

  const playerRef = useRef<Player>({
    id: 1,
    name: PLAYER_PROFILE.name,
    color: PLAYER_PROFILE.color,
    headLatticeIndex: toLatticeVertexIndices(PLAYER_SPAWN),
    previousHeadLatticeIndex: toLatticeVertexIndices(PLAYER_SPAWN),
    direction: PLAYER_START_DIRECTION,
    pendingDirection: PLAYER_START_DIRECTION,
    isAlive: true,
    ticksSurvived: 0,
    isLayingWall: true,
    wallEnergy: 1,
  });
  const rivalRef = useRef<Player>({
    id: 2,
    name: opponent.name,
    color: opponent.color,
    headLatticeIndex: toLatticeVertexIndices(RIVAL_SPAWN),
    previousHeadLatticeIndex: toLatticeVertexIndices(RIVAL_SPAWN),
    direction: RIVAL_START_DIRECTION,
    pendingDirection: RIVAL_START_DIRECTION,
    isAlive: true,
    ticksSurvived: 0,
    isLayingWall: true,
    wallEnergy: 1,
  });

  /** Wipe the arena and put both riders back on their marks. */
  const resetBoard = useCallback((): void => {
    occupancyRef.current = createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns);
    playerTrailRef.current = createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns);
    rivalTrailRef.current = createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns);

    const player = playerRef.current;
    player.headLatticeIndex = toLatticeVertexIndices(PLAYER_SPAWN);
    player.previousHeadLatticeIndex = toLatticeVertexIndices(PLAYER_SPAWN);
    player.direction = PLAYER_START_DIRECTION;
    player.pendingDirection = PLAYER_START_DIRECTION;
    player.isAlive = true;
    player.ticksSurvived = 0;
    player.isLayingWall = true;
    player.wallEnergy = 1;

    const rival = rivalRef.current;
    rival.name = opponent.name;
    rival.color = opponent.color;
    rival.headLatticeIndex = toLatticeVertexIndices(RIVAL_SPAWN);
    rival.previousHeadLatticeIndex = toLatticeVertexIndices(RIVAL_SPAWN);
    rival.direction = RIVAL_START_DIRECTION;
    rival.pendingDirection = RIVAL_START_DIRECTION;
    rival.isAlive = true;
    rival.ticksSurvived = 0;
    rival.isLayingWall = true;
    rival.wallEnergy = 1;

    tickCounterRef.current = 0;
    // The meter isn't reset here: the first tick of the new round reads it
    // straight off the rider and corrects it, a tenth of a second later.
  }, [opponent]);

  /**
   * Switch a rider's wall off, or back on.
   *
   * Off is only granted while there is something in the tank; on is always
   * allowed, so nobody can be stranded with the ability stuck open.
   */
  function cutWall(rider: Player): void {
    if (!jetWallEnabled || !isRoundRunning(state) || !rider.isAlive) return;
    if (rider.isLayingWall && rider.wallEnergy <= 0) return;

    rider.isLayingWall = !rider.isLayingWall;
    if (rider.id === playerRef.current.id) setIsPlayerCuttingWall(!rider.isLayingWall);
  }

  /** One logic step. Called by the loop, never during a render. */
  function advanceOneTick(): void {
    const player = playerRef.current;
    const rival = rivalRef.current;

    // A crash lands mid-frame: the rest of the catch-up ticks must not run.
    if (!player.isAlive || !rival.isAlive) return;

    if (state.matchMode === "solo") {
      const view = {
        grid: GRID_CONFIG,
        lattice: occupancyRef.current,
        self: rival,
        opponent: player,
      };

      if (shouldDecideThisTick(view, opponent.difficulty, tickCounterRef.current)) {
        rival.pendingDirection = decideNextDirection(view, opponent.difficulty);
      }

      // The bot spends its tank the way a rider would: on getting out of
      // somewhere, not on riding around with the wall off.
      if (jetWallEnabled) {
        rival.isLayingWall = !shouldCutWall(view, !rival.isLayingWall);
      }
    }

    applyPendingDirection(playerRef);
    applyPendingDirection(rivalRef);

    // Both riders are resolved against the same board, so a head-on takes them
    // both down instead of whoever happened to be moved second.
    const crashes = advanceRiders(
      [player, rival],
      GRID_CONFIG,
      occupancyRef.current,
      [playerTrailRef.current, rivalTrailRef.current]
    );

    if (crashes[0] || crashes[1]) {
      const outcome = crashes[0] && crashes[1] ? "draw" : crashes[0] ? "lose" : "win";

      const lines: string[] = [];
      if (crashes[0]) lines.push(describeCrash(crashes[0], player.name, rival.name));
      // A head-on already names both riders; don't say it twice.
      if (crashes[1] && !(crashes[0] === "headOn" && crashes[1] === "headOn")) {
        lines.push(describeCrash(crashes[1], rival.name, player.name));
      }

      if (outcome === "win") sound.levelClear();
      else sound.crash();

      dispatch({ type: "endRound", outcome, message: lines.join(" ") });
      return;
    }

    tickCounterRef.current += 1;
    if (tickCounterRef.current % ticksPerSecondAtLevel(state.level) === 0) {
      dispatch({ type: "awardSurvival" });
    }

    if (jetWallEnabled) {
      setWallEnergyPercent((shown) => {
        const actual = Math.round(player.wallEnergy * 20) * 5;
        return actual === shown ? shown : actual;
      });
      setIsPlayerCuttingWall(!player.isLayingWall);
    }
  }

  function viewFor(
    rider: Player,
    trail: LatticeMatrix,
    labelMode: PlayerRenderView["labelMode"]
  ): PlayerRenderView {
    return {
      color: rider.color,
      label: rider.name,
      labelMode,
      isLayingWall: rider.isLayingWall,
      headLatticeIndex: rider.headLatticeIndex,
      previousHeadLatticeIndex: rider.previousHeadLatticeIndex,
      direction: rider.direction,
      isAlive: rider.isAlive,
      trail,
    };
  }

  function buildFrame(interpolationAlpha: number): RenderFrame {
    return {
      grid: GRID_CONFIG,
      players: [
        // Your own name is a reminder, not information: it fades. Theirs stays.
        viewFor(playerRef.current, playerTrailRef.current, "brief"),
        viewFor(rivalRef.current, rivalTrailRef.current, "always"),
      ],
      interpolationAlpha,
      speedFactor: (state.level - 1) / Math.max(1, LEVEL_COUNT - 1),
    };
  }

  const renderers = useArenaRenderers({
    renderMode: state.renderMode,
    glowEnabled,
    stepMilliseconds: stepMillisecondsForLevel(state.level),
    isRunning: isRoundRunning(state),
    advanceOneTick,
    buildFrame,
    onWebglUnavailable: useCallback(
      () => dispatch({ type: "useRenderMode", renderMode: "2d" }),
      []
    ),
  });

  const { resetRound: resetRenderers } = renderers;

  // A new round was declared: clear the board and the walls drawn from it.
  useEffect(() => {
    resetBoard();
    resetRenderers();
  }, [state.roundToken, resetBoard, resetRenderers]);

  // Sound follows the game: one drone while riding, nothing while paused.
  useEffect(() => {
    sound.setMuted(!soundEnabled);
  }, [sound, soundEnabled]);

  useEffect(() => {
    if (isRoundRunning(state) && soundEnabled) {
      sound.startEngine((state.level - 1) / Math.max(1, LEVEL_COUNT - 1));
    } else {
      sound.stopEngine();
    }
  }, [sound, state, soundEnabled]);

  // A tab in the background stops getting frames, so pause rather than letting
  // the player come back to a round that carried on without them.
  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.hidden) dispatch({ type: "pause" });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // A returning cockpit player gets the chunk warmed up; a player who only ever
  // opens the flat board never downloads it at all.
  useEffect(() => {
    if (state.gameState === "menu" && state.renderMode === "3d") {
      void loadThreeRenderer();
    }
  }, [state.gameState, state.renderMode]);

  const persistScore = useCallback((name: string, finalScore: number): void => {
    const updatedHighScores = tryInsertHighScore({
      name,
      score: finalScore,
      dateISO: new Date().toISOString(),
    });

    setLeaderboard(updatedHighScores);
    setHighScore(
      updatedHighScores.length
        ? Math.max(...updatedHighScores.map((entry) => entry.score))
        : 0
    );
  }, []);

  /**
   * The run is over: save the score if we know who to credit, and ask if we
   * don't. window.prompt is unreliable on mobile and disabled in several in-app
   * browsers, so the overlay carries the form.
   */
  const finalizeRun = useCallback(
    (finalScore: number): void => {
      if (playerName) {
        persistScore(playerName, finalScore);
        setNeedsNameForSave(false);
      } else {
        setNeedsNameForSave(true);
      }
    },
    [playerName, persistScore]
  );

  // Keyboard.
  useEffect(() => {
    const controls: KeyboardControls[] = [
      {
        playerRef: playerRef as RefObject<PlayerForInput>,
        scheme: state.matchMode === "versus" ? "arrows" : "both",
        steeringMode,
        cutKey: jetWallEnabled ? " " : undefined,
        onCut: () => cutWall(playerRef.current),
      },
    ];

    if (state.matchMode === "versus") {
      controls.push({
        playerRef: rivalRef as RefObject<PlayerForInput>,
        scheme: "wasd",
        steeringMode: "absolute",
        cutKey: jetWallEnabled ? "Shift" : undefined,
        onCut: () => cutWall(rivalRef.current),
      });
    }

    function keydownHandler(event: KeyboardEvent): void {
      if (state.gameState === "menu" && (event.key === "Enter" || event.key === " ")) {
        dispatch({ type: "startRun", matchMode: "solo", renderMode: state.renderMode });
        return;
      }

      // Game keys only apply mid-round; otherwise typing in overlay inputs
      // (e.g. the letter "r" in a player name) would reset the board.
      if (state.gameState !== "playing") return;

      const before = controls.map((control) => control.playerRef.current.pendingDirection);
      handleKeyDown(
        event,
        controls,
        () => dispatch({ type: "restartRoundManually" }),
        () => dispatch({ type: "togglePause" })
      );
      const turned = controls.some(
        (control, index) => control.playerRef.current.pendingDirection !== before[index]
      );

      if (turned && !state.isPaused) sound.turn();
    }

    window.addEventListener("keydown", keydownHandler);
    return () => window.removeEventListener("keydown", keydownHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.gameState,
    state.isPaused,
    state.matchMode,
    state.renderMode,
    steeringMode,
    jetWallEnabled,
    sound,
  ]);

  const startRun = useCallback((matchMode: MatchMode, renderMode: RenderMode): void => {
    saveRenderMode(renderMode);
    setNeedsNameForSave(false);
    dispatch({ type: "startRun", matchMode, renderMode });
  }, []);

  const actions = {
    startRun,

    playAgain: (): void => startRun(state.matchMode, state.renderMode),

    continueAfterRound: (): void => {
      // Ask the rules what this press means before making it: a press that ends
      // the run is also the moment the score gets written down. Saving from an
      // effect instead would fire on a render rather than on the decision.
      const next = matchReducer(state, { type: "continueAfterRound" });
      dispatch({ type: "continueAfterRound" });

      if (next.gameState === "gameOver" && state.gameState !== "gameOver") {
        finalizeRun(next.score);
      }
    },

    restartRound: (): void => dispatch({ type: "restartRoundManually" }),

    togglePause: (): void => dispatch({ type: "togglePause" }),

    resume: (): void => dispatch({ type: "resume" }),

    backToMenu: (): void => dispatch({ type: "backToMenu" }),

    steer: (direction: Direction): void => {
      if (!isRoundRunning(state)) return;

      const player = playerRef.current;
      const before = player.pendingDirection;
      player.pendingDirection = resolveSteering(direction, player.direction, steeringMode);
      if (player.pendingDirection !== before) sound.turn();
    },

    toggleSound: (): void => {
      const next = !soundEnabled;
      setSoundEnabled(next);
      saveSoundEnabled(next);
    },

    toggleGlow: (): void => {
      const next = !glowEnabled;
      setGlowPreference(next);
      saveGlowPreference(next);
    },

    toggleJetWall: (): void => {
      const next = !jetWallEnabled;
      setJetWallEnabled(next);
      saveJetWallEnabled(next);
    },

    cutWall: (): void => cutWall(playerRef.current),

    saveScoreAs: (name: string): void => {
      const trimmedName = name.trim().slice(0, 20);
      if (!trimmedName) return;

      setPlayerName(trimmedName);
      savePlayerName(trimmedName);
      persistScore(trimmedName, state.score);
      setNeedsNameForSave(false);
    },

    requestNameChange: (): void => setNeedsNameForSave(true),

    prefetchCockpit: (): void => void loadThreeRenderer(),
  };

  return {
    state,
    opponent,
    playerLabel: PLAYER_PROFILE.name,
    playerColor: PLAYER_PROFILE.color,
    steeringMode,
    isMobile,
    playerName,
    highScore,
    leaderboard,
    needsNameForSave,
    soundEnabled,
    glowEnabled,
    jetWallEnabled,
    wallEnergyPercent,
    isPlayerCuttingWall,
    canvasRef: renderers.canvasRef,
    minimapCanvasRef: renderers.minimapCanvasRef,
    canvasKey: renderers.canvasKey,
    actions,
  };
}
