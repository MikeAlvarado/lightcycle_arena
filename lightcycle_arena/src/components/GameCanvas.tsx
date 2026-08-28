// React
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, ReactNode, RefObject } from 'react';

// Types (propios)
import type {
  GameState,
  HighScoreEntry,
  MatchMode,
  RenderMode,
  RoundOutcome,
} from '../types/game';
import type { LatticeMatrix, LogicalVertex } from '../utils/latticeHelpers';
import type { Player, PlayerForInput } from '../types/player';
import type { AiDifficulty } from '../ai/simpleAI';
import type { CrashCause } from '../game/movement';
import type { GameRenderer, RenderFrame } from '../render/types';
import type { KeyboardControls } from '../utils/inputHandlers';
import type { SteeringMode } from '../utils/steering';
import type { OverlayAction } from './GameOverlay';

// Config / constantes
import {
  INITIAL_LIVES,
  LEVEL_COUNT,
  bonusForLevel,
  difficultyForLevel,
  pointsPerSecond,
  stepMillisecondsForLevel,
  ticksPerSecondAtLevel,
} from '../config/levels';
import { GRID_CONFIG } from '../utils/gridConfig';

// Utils (funcionales puros)
import {
  applyPendingDirection,
  createEmptyLattice,
  toLatticeVertexIndices,
} from '../utils/latticeHelpers';
import { advanceRiders, describeCrash } from '../game/movement';
import {
  loadGlowPreference,
  loadHighScoreMax,
  loadHighScores,
  loadPlayerName,
  loadRenderMode,
  loadSoundEnabled,
  saveGlowPreference,
  savePlayerName,
  saveRenderMode,
  saveSoundEnabled,
  tryInsertHighScore,
} from '../utils/storage';

// Entrada / renderizado
import { handleKeyDown as handleKeyDownBase } from '../utils/inputHandlers';
import { resolveSteering } from '../utils/steering';
import { createCanvas2DRenderer } from '../render/canvas2dRenderer';
import { loadThreeRenderer } from '../render/loadThreeRenderer';

// IA, audio y hooks
import { AI_PARAMS, decideNextDirection } from '../ai/simpleAI';
import { getSoundEngine } from '../audio/soundEngine';
import { useIsMobile } from '../hooks/useIsMobile';

// Componentes UI
import { DPadOverlay } from './DPadOverlay';
import { GameOverlay } from './GameOverlay';

// Estilos
import '../styles/gameCanvasOverlay.css';
import '../styles/gameUI.css';

const PLAYER_ONE_COLOR = '#ffc23a';
const PLAYER_TWO_COLOR = '#31d7ff';
const PLAYER_ONE_NAME = 'Yellow';
const PLAYER_TWO_NAME = 'Cyan';

/** At most this much elapsed time is replayed in one frame (3 logic ticks). */
const MAXIMUM_CATCH_UP_MILLISECONDS = 300;

export function GameCanvas(): JSX.Element {
  // Loop timing
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const tickCounterRef = useRef<number>(0);

  // Renderers (2D board, 3D cockpit, plus the little 2D map shown in 3D)
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapRendererRef = useRef<GameRenderer | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>(loadRenderMode);
  const [matchMode, setMatchMode] = useState<MatchMode>('solo');
  /** Bumped to rebuild the 3D scene after the GPU hands the context back. */
  const [rendererGeneration, setRendererGeneration] = useState<number>(0);

  // Lattices
  const occupancyLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );
  const playerOneLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );
  const playerTwoLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(GRID_CONFIG.rows, GRID_CONFIG.columns)
  );

  // Game meta
  const [gameState, setGameState] = useState<GameState>('menu');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [level, setLevel] = useState<number>(1);
  const [lives, setLives] = useState<number>(INITIAL_LIVES);
  const [score, setScore] = useState<number>(0);
  const [roundWins, setRoundWins] = useState<[number, number]>([0, 0]);
  const [highScore, setHighScore] = useState<number>(loadHighScoreMax);
  const [playerName, setPlayerName] = useState<string | null>(loadPlayerName);
  const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>(() =>
    loadHighScores()
  );

  // How the last round ended, and the line describing the wreck.
  const [roundOutcome, setRoundOutcome] = useState<RoundOutcome | null>(null);
  const [roundMessage, setRoundMessage] = useState<string | null>(null);
  const [gameOverReason, setGameOverReason] = useState<
    'victory' | 'outOfLives' | 'none'
  >('none');

  // Inline "save your score" form shown on game over when no name is stored yet
  const [needsNameForSave, setNeedsNameForSave] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>('');
  const pendingScoreRef = useRef<number>(0);

  // Evitar doble guardado al final de la run
  const savedThisRunRef = useRef<boolean>(false);
  const isMobile = useIsMobile();

  // Preferencias
  const [soundEnabled, setSoundEnabled] = useState<boolean>(loadSoundEnabled);
  // Kept as an opinion, not a value: with nobody's opinion on file the glow
  // follows the device, and follows it again if the device changes its mind.
  const [glowPreference, setGlowPreference] = useState<boolean | null>(
    loadGlowPreference
  );
  const glowEnabled = glowPreference ?? !isMobile;
  const sound = useMemo(() => getSoundEngine(), []);

  // Spawns
  const playerSpawn: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(GRID_CONFIG.columns / 2),
      rowIndexInCells: GRID_CONFIG.rows - 6,
    }),
    []
  );
  const botSpawn: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(GRID_CONFIG.columns / 2),
      rowIndexInCells: 6,
    }),
    []
  );

  // Players
  const playerOneRef = useRef<Player>({
    id: 1,
    name: PLAYER_ONE_NAME,
    color: PLAYER_ONE_COLOR,
    headLatticeIndex: toLatticeVertexIndices(playerSpawn),
    previousHeadLatticeIndex: toLatticeVertexIndices(playerSpawn),
    direction: 'up',
    pendingDirection: 'up',
    isAlive: true,
    ticksSurvived: 0,
  });
  const playerTwoRef = useRef<Player>({
    id: 2,
    name: PLAYER_TWO_NAME,
    color: PLAYER_TWO_COLOR,
    headLatticeIndex: toLatticeVertexIndices(botSpawn),
    previousHeadLatticeIndex: toLatticeVertexIndices(botSpawn),
    direction: 'down',
    pendingDirection: 'down',
    isAlive: true,
    ticksSurvived: 0,
  });

  // Difficulty by level
  const currentDifficulty = (): AiDifficulty => difficultyForLevel(level);

  /**
   * Looking down at the board, a key press is a compass heading. Riding behind
   * the bike it has to be a turn instead, or steering inverts every time the
   * bike faces south. Player two always rides the flat board.
   */
  const steeringMode: SteeringMode = renderMode === '3d' ? 'relative' : 'absolute';

  // Round reset (keeps lives/level/score)
  const resetRound = useCallback((): void => {
    occupancyLatticeRef.current = createEmptyLattice(
      GRID_CONFIG.rows,
      GRID_CONFIG.columns
    );
    playerOneLatticeRef.current = createEmptyLattice(
      GRID_CONFIG.rows,
      GRID_CONFIG.columns
    );
    playerTwoLatticeRef.current = createEmptyLattice(
      GRID_CONFIG.rows,
      GRID_CONFIG.columns
    );

    playerOneRef.current.headLatticeIndex = toLatticeVertexIndices(playerSpawn);
    playerOneRef.current.previousHeadLatticeIndex =
      toLatticeVertexIndices(playerSpawn);
    playerOneRef.current.direction = 'up';
    playerOneRef.current.pendingDirection = 'up';
    playerOneRef.current.isAlive = true;
    playerOneRef.current.ticksSurvived = 0;

    playerTwoRef.current.headLatticeIndex = toLatticeVertexIndices(botSpawn);
    playerTwoRef.current.previousHeadLatticeIndex =
      toLatticeVertexIndices(botSpawn);
    playerTwoRef.current.direction = 'down';
    playerTwoRef.current.pendingDirection = 'down';
    playerTwoRef.current.isAlive = true;
    playerTwoRef.current.ticksSurvived = 0;

    setRoundOutcome(null);
    setRoundMessage(null);
    savedThisRunRef.current = false;
    tickCounterRef.current = 0;

    // Drop the walls the 3D scene built during the previous round and re-anchor
    // the frame clock so the first frame after a reset doesn't jump.
    rendererRef.current?.resetRound();
    minimapRendererRef.current?.resetRound();
    accumulatedMilliseconds.current = 0;
    lastFrameTimestamp.current = 0;
  }, [playerSpawn, botSpawn]);

  /** Start a fresh run in the given match and view, remembering the view. */
  const startRun = useCallback(
    (match: MatchMode, mode: RenderMode): void => {
      setMatchMode(match);
      setRenderMode(mode);
      saveRenderMode(mode);

      setLevel(1);
      setLives(INITIAL_LIVES);
      setScore(0);
      setRoundWins([0, 0]);
      setGameOverReason('none');
      setNeedsNameForSave(false);
      setIsPaused(false);
      setGameState('playing');
      resetRound();
    },
    [resetRound]
  );

  const startNewRun = useCallback((): void => {
    startRun(matchMode, renderMode);
  }, [startRun, matchMode, renderMode]);

  /** Persist a score entry and refresh the leaderboard/high-score UI state. */
  function persistScore(name: string): void {
    const updatedHighScores = tryInsertHighScore({
      name,
      score: pendingScoreRef.current,
      dateISO: new Date().toISOString(),
    });

    setLeaderboard(updatedHighScores);
    setHighScore(
      updatedHighScores.length
        ? Math.max(...updatedHighScores.map((entry) => entry.score))
        : 0
    );
  }

  /**
   * Finalizes the full run (after losing all lives or clearing all levels).
   * Saves the score right away when a name is stored; otherwise the gameOver
   * overlay shows an inline form to enter it (window.prompt is unreliable on
   * mobile and disabled in several in-app browsers).
   */
  function finalizeRunAndSave(runResult: 'victory' | 'outOfLives'): void {
    // Prevent duplicate saving or prompts
    if (savedThisRunRef.current) return;
    savedThisRunRef.current = true;
    setGameOverReason(runResult);
    pendingScoreRef.current = score; // level bonus already included earlier if win

    if (playerName) {
      persistScore(playerName);
      setNeedsNameForSave(false);
    } else {
      setNeedsNameForSave(true);
    }

    setGameState('gameOver');
  }

  /** Called from the gameOver overlay form once the player typed a name. */
  function handleSaveNameAndScore(): void {
    const trimmedName = nameDraft.trim().slice(0, 20);
    if (!trimmedName) return;

    setPlayerName(trimmedName);
    savePlayerName(trimmedName);
    persistScore(trimmedName);
    setNeedsNameForSave(false);
  }

  /** Close the round and say what happened, in both riders' words. */
  function endRound(crashes: Array<CrashCause | null>): void {
    const outcome: RoundOutcome =
      crashes[0] && crashes[1] ? 'draw' : crashes[0] ? 'lose' : 'win';

    const lines: string[] = [];
    if (crashes[0]) {
      lines.push(describeCrash(crashes[0], PLAYER_ONE_NAME, PLAYER_TWO_NAME));
    }
    // A head-on already names both riders; don't say it twice.
    if (crashes[1] && !(crashes[0] === 'headOn' && crashes[1] === 'headOn')) {
      lines.push(describeCrash(crashes[1], PLAYER_TWO_NAME, PLAYER_ONE_NAME));
    }

    setRoundOutcome(outcome);
    setRoundMessage(lines.join(' '));

    if (matchMode === 'versus') {
      setRoundWins(([first, second]) =>
        outcome === 'win'
          ? [first + 1, second]
          : outcome === 'lose'
            ? [first, second + 1]
            : [first, second]
      );
    } else if (outcome === 'win') {
      setScore((previousScore) => previousScore + bonusForLevel(level));
    }

    if (outcome === 'win') sound.levelClear();
    else sound.crash();

    setGameState('roundEnd');
  }

  /**
   * Manual reset (R key / on-screen Reset button) during play counts as a
   * lost round, same as a crash. Without this, resetting right before a
   * crash would dodge losing a life for free, making lives meaningless.
   * In a versus match nobody is awarded the round.
   */
  function handleManualReset(): void {
    if (gameState !== 'playing') return;

    setRoundOutcome(matchMode === 'versus' ? 'draw' : 'lose');
    setRoundMessage(
      matchMode === 'versus' ? 'Round reset.' : 'Round reset — life lost.'
    );
    setGameState('roundEnd');
  }

  function togglePause(): void {
    if (gameState !== 'playing') return;
    setIsPaused((paused) => !paused);
  }

  // Per-tick logic
  function updateLogic(): void {
    if (gameState !== 'playing' || isPaused) return;

    // Bot decision cadence by difficulty (a second person needs no help)
    if (matchMode === 'solo' && playerTwoRef.current.isAlive) {
      const params = AI_PARAMS[currentDifficulty()];
      // Math.max guards against a 0 cadence: n % 0 is NaN, which would silently
      // disable the bot's decision-making for that difficulty.
      const decisionCadence = Math.max(1, params.decisionEveryNTicks);

      if (tickCounterRef.current % decisionCadence === 0) {
        playerTwoRef.current.pendingDirection = decideNextDirection(
          {
            grid: GRID_CONFIG,
            lattice: occupancyLatticeRef.current,
            self: playerTwoRef.current,
            opponent: playerOneRef.current,
          },
          currentDifficulty()
        );
      }
    }

    applyPendingDirection(playerOneRef);
    applyPendingDirection(playerTwoRef);

    // Both riders are resolved against the same board, so a head-on takes them
    // both down instead of whoever happened to be moved second.
    const crashes = advanceRiders(
      [playerOneRef.current, playerTwoRef.current],
      GRID_CONFIG,
      occupancyLatticeRef.current,
      [playerOneLatticeRef.current, playerTwoLatticeRef.current]
    );

    if (crashes[0] || crashes[1]) {
      endRound(crashes);
      return;
    }

    tickCounterRef.current += 1;

    if (
      matchMode === 'solo' &&
      tickCounterRef.current % ticksPerSecondAtLevel(level) === 0
    ) {
      setScore((previousScore) => previousScore + pointsPerSecond(level));
    }
  }

  /**
   * Snapshot of the round in render-agnostic terms.
   * `interpolationAlpha` is how far the heads have travelled inside the current
   * logic tick: the 2D board ignores it, the 3D cockpit rides on it.
   */
  function buildRenderFrame(interpolationAlpha: number): RenderFrame {
    const controlsHint =
      isMobile || renderMode !== '2d'
        ? null
        : matchMode === 'versus'
          ? 'P1: Arrows | P2: WASD | Reset: R | Pause: P'
          : 'Move: Arrows/WASD | Reset: R | Pause: P';

    return {
      grid: GRID_CONFIG,
      players: [
        {
          color: playerOneRef.current.color,
          headLatticeIndex: playerOneRef.current.headLatticeIndex,
          previousHeadLatticeIndex:
            playerOneRef.current.previousHeadLatticeIndex,
          direction: playerOneRef.current.direction,
          isAlive: playerOneRef.current.isAlive,
          trail: playerOneLatticeRef.current,
        },
        {
          color: playerTwoRef.current.color,
          headLatticeIndex: playerTwoRef.current.headLatticeIndex,
          previousHeadLatticeIndex:
            playerTwoRef.current.previousHeadLatticeIndex,
          direction: playerTwoRef.current.direction,
          isAlive: playerTwoRef.current.isAlive,
          trail: playerTwoLatticeRef.current,
        },
      ],
      interpolationAlpha,
      controlsHint,
    };
  }

  // Sound follows the game: one drone while riding, nothing while paused.
  useEffect(() => {
    sound.setMuted(!soundEnabled);
  }, [sound, soundEnabled]);

  useEffect(() => {
    if (gameState === 'playing' && !isPaused && soundEnabled) {
      sound.startEngine((level - 1) / Math.max(1, LEVEL_COUNT - 1));
    } else {
      sound.stopEngine();
    }
  }, [sound, gameState, isPaused, soundEnabled, level]);

  // A tab in the background stops getting frames, so pause rather than letting
  // the player come back to a round that carried on without them.
  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.hidden) setIsPaused(true);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Coming back from a pause must not replay the pause as elapsed game time.
  useEffect(() => {
    if (!isPaused) {
      lastFrameTimestamp.current = 0;
      accumulatedMilliseconds.current = 0;
    }
  }, [isPaused]);

  // A returning cockpit player gets the chunk warmed up; a player who only ever
  // opens the flat board never downloads it at all.
  useEffect(() => {
    if (gameState === 'menu' && renderMode === '3d') void loadThreeRenderer();
  }, [gameState, renderMode]);

  // Main renderer lifecycle. Kept out of the loop effect so switching level or
  // game state never tears down the 3D scene.
  useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) return;

    if (renderMode !== '3d') {
      const renderer = createCanvas2DRenderer(canvas, GRID_CONFIG);
      rendererRef.current = renderer;
      renderer.resize();

      return () => {
        renderer.dispose();
        rendererRef.current = null;
      };
    }

    let cancelled = false;

    loadThreeRenderer()
      .then(({ createThreeRenderer }) => {
        if (cancelled) return;

        const renderer = createThreeRenderer(canvas, GRID_CONFIG, {
          enableBloom: glowEnabled,
          // A dropped context takes every buffer with it, so the scene is
          // rebuilt from scratch once the browser hands it back.
          onContextRestored: () => setRendererGeneration((count) => count + 1),
        });
        rendererRef.current = renderer;
        renderer.resize();
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        // Either the chunk failed to load or there is no WebGL context to be
        // had (old device, blocked GPU). Fall back to the flat board instead of
        // leaving the player staring at nothing.
        console.warn('3D view unavailable, falling back to the flat board:', error);
        setRenderMode('2d');
      });

    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [renderMode, glowEnabled, rendererGeneration]);

  // Minimap: the 2D board reused at postage-stamp size, so the cockpit view
  // doesn't cost the player all arena awareness.
  useEffect(() => {
    const minimapCanvas = minimapCanvasReference.current;
    if (renderMode !== '3d' || !minimapCanvas) return;

    const minimapRenderer = createCanvas2DRenderer(minimapCanvas, GRID_CONFIG, {
      sizing: 'match-css-size',
    });
    minimapRendererRef.current = minimapRenderer;
    minimapRenderer.resize();

    return () => {
      minimapRenderer.dispose();
      minimapRendererRef.current = null;
    };
  }, [renderMode]);

  // Loop + draw
  useEffect(() => {
    const logicStepMilliseconds = stepMillisecondsForLevel(level);

    function animationLoop(currentTimestamp: number): void {
      if (!lastFrameTimestamp.current)
        lastFrameTimestamp.current = currentTimestamp;

      // requestAnimationFrame stops in a hidden tab, so the first frame back
      // carries the whole pause. Without this cap the catch-up loop would run
      // hundreds of ticks at once and crash the player before anything is drawn.
      const elapsed = Math.min(
        MAXIMUM_CATCH_UP_MILLISECONDS,
        currentTimestamp - lastFrameTimestamp.current
      );
      lastFrameTimestamp.current = currentTimestamp;
      accumulatedMilliseconds.current += elapsed;

      while (accumulatedMilliseconds.current >= logicStepMilliseconds) {
        updateLogic();
        accumulatedMilliseconds.current -= logicStepMilliseconds;
      }

      // Between ticks nothing moves, so freeze the heads on their vertex.
      const interpolationAlpha =
        gameState === 'playing' && !isPaused
          ? Math.min(1, accumulatedMilliseconds.current / logicStepMilliseconds)
          : 1;

      const frame = buildRenderFrame(interpolationAlpha);
      rendererRef.current?.draw(frame);
      minimapRendererRef.current?.draw({ ...frame, controlsHint: null });

      requestIdReference.current = requestAnimationFrame(animationLoop);
    }

    function onResize(): void {
      rendererRef.current?.resize();
      minimapRendererRef.current?.resize();
    }

    onResize();
    window.addEventListener('resize', onResize);
    requestIdReference.current = requestAnimationFrame(animationLoop);

    return () => {
      cancelAnimationFrame(requestIdReference.current);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isPaused, level, isMobile, matchMode, renderMode, rendererGeneration]);

  // Inputs
  useEffect(() => {
    const controls: KeyboardControls[] = [
      {
        playerRef: playerOneRef as RefObject<PlayerForInput>,
        scheme: matchMode === 'versus' ? 'arrows' : 'both',
        steeringMode,
      },
    ];

    if (matchMode === 'versus') {
      controls.push({
        playerRef: playerTwoRef as RefObject<PlayerForInput>,
        scheme: 'wasd',
        steeringMode: 'absolute',
      });
    }

    function keydownHandler(event: KeyboardEvent): void {
      if (
        gameState === 'menu' &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        startRun('solo', renderMode);
        return;
      }

      // Game keys only apply mid-round; otherwise typing in overlay inputs
      // (e.g. the letter "r" in a player name) would reset the board.
      if (gameState !== 'playing') return;

      const before = controls.map((control) => control.playerRef.current.pendingDirection);
      handleKeyDownBase(event, controls, handleManualReset, togglePause);
      const turned = controls.some(
        (control, index) => control.playerRef.current.pendingDirection !== before[index]
      );

      if (turned && !isPaused) sound.turn();
    }

    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isPaused, matchMode, renderMode, steeringMode, startRun, sound]);

  /**
   * Handles the transition from "roundEnd" to the next state.
   * - Won → next level (or finalize the run if that was the last one)
   * - Lost or drew → a life goes (or the run ends if that was the last one)
   */
  function handleRoundEndPrimary(): void {
    if (matchMode === 'versus') {
      setGameState('playing');
      resetRound();
      return;
    }

    if (roundOutcome === 'win') {
      const isLastLevel = level >= LEVEL_COUNT;
      if (isLastLevel) {
        finalizeRunAndSave('victory');
        return;
      }

      setLevel((currentLevel) => Math.min(currentLevel + 1, LEVEL_COUNT));
      setGameState('playing');
      resetRound();
      return;
    }

    const remainingLives = lives - 1;
    if (remainingLives <= 0) {
      setLives(0);
      finalizeRunAndSave('outOfLives');
      return;
    }

    setLives(remainingLives);
    setGameState('playing');
    resetRound();
  }

  /** Back to the menu with a clean arena, so the view can be switched. */
  function handleBackToMenu(): void {
    setGameState('menu');
    setIsPaused(false);
    resetRound();
  }

  function handleTouchDirection(
    direction: 'up' | 'down' | 'left' | 'right'
  ): void {
    if (gameState !== 'playing' || isPaused) return;

    const before = playerOneRef.current.pendingDirection;
    playerOneRef.current.pendingDirection = resolveSteering(
      direction,
      playerOneRef.current.direction,
      steeringMode
    );

    if (playerOneRef.current.pendingDirection !== before) sound.turn();
  }

  function toggleSound(): void {
    setSoundEnabled((enabled) => {
      const next = !enabled;
      saveSoundEnabled(next);
      return next;
    });
  }

  function toggleGlow(): void {
    const next = !glowEnabled;
    setGlowPreference(next);
    saveGlowPreference(next);
  }

  // HUD
  const hearts = '❤'.repeat(Math.max(0, lives));
  const formattedScore = score.toString().padStart(8, '0');
  const formattedHighScore = highScore.toString().padStart(8, '0');
  const viewLabel = renderMode === '3d' ? '3D Cockpit' : '2D Classic';
  const shortViewLabel = renderMode === '3d' ? '3D' : '2D';

  // Plain JSX (not a nested component) so React doesn't remount the subtree
  // on every GameCanvas render.
  const hud = (
    <div className='game-ui'>
      <h1 className='game-title'>Lightcycle Arena</h1>

      {matchMode === 'versus' ? (
        <div className='hud-container'>
          <div className='hud-row'>
            <span className='hud-score' style={{ color: PLAYER_ONE_COLOR }}>
              {PLAYER_ONE_NAME}: {roundWins[0]}
            </span>
            <span className='hud-highscore-label'>Rounds</span>
            <span className='hud-score' style={{ color: PLAYER_TWO_COLOR }}>
              {PLAYER_TWO_NAME}: {roundWins[1]}
            </span>
          </div>
          <div className='hud-row' style={{ opacity: 0.9 }}>
            <span>P1: Arrows</span>
            <span>View: {shortViewLabel}</span>
            <span>P2: WASD</span>
          </div>
        </div>
      ) : (
        <div className='hud-container'>
          <div className='hud-row'>
            <span className='hud-lives'>Lives: {hearts || '—'}</span>
            <span className='hud-highscore-label'>High Score</span>
          </div>
          <div className='hud-row'>
            <span className='hud-score'>Score: {formattedScore}</span>
            <span className='hud-highscore-value'>{formattedHighScore}</span>
          </div>
          <div className='hud-row' style={{ opacity: 0.9 }}>
            <span>
              Level: {level}/{LEVEL_COUNT}
            </span>
            <span>View: {shortViewLabel}</span>
            <span>Mode: {currentDifficulty()}</span>
          </div>
        </div>
      )}
    </div>
  );

  const preferenceToggles = (
    <div className='overlay-toggles'>
      <button
        type='button'
        onClick={toggleSound}
        aria-pressed={soundEnabled}
      >
        Sound: {soundEnabled ? 'On' : 'Off'}
      </button>
      <button type='button' onClick={toggleGlow} aria-pressed={glowEnabled}>
        Glow: {glowEnabled ? 'On' : 'Off'}
      </button>
    </div>
  );

  /**
   * Computes the overlay copy and actions depending on the current game state.
   * Centralizes all overlay variants to avoid repeated JSX.
   */
  function getOverlayConfig(): {
    title: string;
    paragraph?: string;
    actions: OverlayAction[];
    showLeaderboard: boolean;
    extraContent?: ReactNode;
    styleOverride?: CSSProperties;
  } {
    if (isPaused && gameState === 'playing') {
      return {
        title: 'Paused',
        paragraph: 'The arena waits.',
        actions: [
          { label: 'Resume', onSelect: () => setIsPaused(false) },
          { label: 'Menu', variant: 'secondary', onSelect: handleBackToMenu },
        ],
        showLeaderboard: false,
      };
    }

    if (gameState === 'menu') {
      const actions: OverlayAction[] = [
        { label: '2D Classic', onSelect: () => startRun('solo', '2d') },
        {
          label: '3D Cockpit',
          onSelect: () => startRun('solo', '3d'),
          onPrefetch: () => void loadThreeRenderer(),
        },
      ];

      // Two people need two halves of a keyboard, which a phone hasn't got.
      if (!isMobile) {
        actions.push({
          label: '2 Players',
          variant: 'secondary',
          onSelect: () => startRun('versus', '2d'),
        });
      }

      return {
        title: 'Lightcycle Arena',
        paragraph:
          '2D Classic: arrows steer by compass · 3D Cockpit: left/right turn the bike · R resets · P pauses',
        actions,
        showLeaderboard: true,
        extraContent: (
          <>
            {preferenceToggles}
            <p className='menu-hint'>
              Enter starts a solo run in the last view used ({viewLabel})
            </p>
          </>
        ),
        styleOverride: { background: 'rgba(0,0,0,0.65)' },
      };
    }

    if (gameState === 'roundEnd') {
      const wonRound = roundOutcome === 'win';
      const title =
        matchMode === 'versus'
          ? roundOutcome === 'draw'
            ? 'Draw'
            : `${wonRound ? PLAYER_ONE_NAME : PLAYER_TWO_NAME} takes the round`
          : roundOutcome === 'draw'
            ? 'Both riders down'
            : wonRound
              ? 'You win! Level cleared.'
              : 'Bot wins! You crashed.';

      const actions: OverlayAction[] = [
        {
          label:
            matchMode === 'versus'
              ? 'Next round'
              : wonRound
                ? 'Next Level'
                : 'Retry',
          onSelect: handleRoundEndPrimary,
        },
        { label: 'Menu', variant: 'secondary', onSelect: handleBackToMenu },
      ];

      return {
        title,
        paragraph: roundMessage ?? undefined,
        actions,
        showLeaderboard: matchMode === 'solo',
      };
    }

    if (gameState === 'gameOver') {
      const title = gameOverReason === 'victory' ? 'Run Complete' : 'Game Over';

      return {
        title,
        actions: [
          { label: 'Play Again', onSelect: startNewRun },
          { label: 'Menu', variant: 'secondary', onSelect: handleBackToMenu },
        ],
        showLeaderboard: true,
        extraContent: (
          <>
            <p style={{ marginTop: 6 }}>Your final score: {formattedScore}</p>
            {needsNameForSave ? (
              <div className='save-score-form'>
                <input
                  type='text'
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleSaveNameAndScore();
                  }}
                  maxLength={20}
                  placeholder='Your name'
                  aria-label='Player name'
                  autoComplete='off'
                />
                <button
                  onClick={handleSaveNameAndScore}
                  disabled={nameDraft.trim().length === 0}
                >
                  Save score
                </button>
              </div>
            ) : (
              playerName && (
                <p className='menu-hint'>
                  Saved as {playerName} ·{' '}
                  <button
                    type='button'
                    className='link-button'
                    onClick={() => {
                      setNameDraft(playerName);
                      setNeedsNameForSave(true);
                    }}
                  >
                    change name
                  </button>
                </p>
              )
            )}
          </>
        ),
      };
    }

    // Fallback
    return { title: '', actions: [], showLeaderboard: false };
  }

  // Same as the HUD: computed JSX instead of a nested component, so overlay
  // children (like the save-score input) keep focus across re-renders.
  const overlayVisible = gameState !== 'playing' || isPaused;
  const overlayConfig = overlayVisible ? getOverlayConfig() : null;
  const stateOverlay = overlayConfig ? (
    <GameOverlay
      title={overlayConfig.title}
      paragraph={overlayConfig.paragraph}
      actions={overlayConfig.actions}
      showLeaderboard={overlayConfig.showLeaderboard}
      leaderboardEntries={leaderboard}
      maxRows={5}
      extraContent={overlayConfig.extraContent}
      styleOverride={overlayConfig.styleOverride}
    />
  ) : null;

  // The canvas is keyed by view: a canvas that already handed out a 2D context
  // can never give a WebGL one, so switching views needs a brand new element.
  // The generation counter does the same after a lost WebGL context.
  const arena = (
    <div className='canvas-zone'>
      <canvas
        key={`${renderMode}-${rendererGeneration}`}
        ref={canvasReference}
        className={renderMode === '3d' ? 'arena-canvas-3d' : undefined}
      />
      {renderMode === '3d' && (
        <canvas
          ref={minimapCanvasReference}
          className='minimap-canvas'
          aria-hidden='true'
        />
      )}
      {stateOverlay}
    </div>
  );

  // Render (flex layout ya configurado en tu index.css)
  return isMobile ? (
    <div className='mobile-stage'>
      <div className='hud-zone'>{hud}</div>
      {arena}
      <div className='controls-zone'>
        <DPadOverlay
          onInput={handleTouchDirection}
          onReset={handleManualReset}
          steeringMode={steeringMode}
        />
      </div>
    </div>
  ) : (
    <div className='game-stage'>
      <div className='hud-zone'>{hud}</div>
      {arena}
    </div>
  );
}
