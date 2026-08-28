// React
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Types (propios)
import type { GameState, HighScoreEntry, RenderMode } from '../types/game';
import type { GridConfig } from '../utils/gridConfig';
import type { LatticeMatrix, LogicalVertex } from '../utils/latticeHelpers';
import type { Player, PlayerForInput } from '../types/player';
import type { AiDifficulty } from '../ai/simpleAI';
import type { GameRenderer, RenderFrame } from '../render/types';

// Config / constantes
import {
  INITIAL_LIVES,
  LEVEL_COUNT,
  bonusForLevel,
  difficultyForLevel,
  pointsPerSecond,
} from '../config/levels';
import { GRID_CONFIG } from '../utils/gridConfig';

// Utils (funcionales puros)
import {
  applyPendingDirection,
  createEmptyLattice,
  isInsideLattice,
  isOccupied,
  occupy,
  stepOnLattice,
  toLatticeVertexIndices,
} from '../utils/latticeHelpers';
import {
  loadHighScoreMax,
  loadHighScores,
  loadPlayerName,
  loadRenderMode,
  savePlayerName,
  saveRenderMode,
  tryInsertHighScore,
} from '../utils/storage';

// Entrada / renderizado
import { handleKeyDown as handleKeyDownBase } from '../utils/inputHandlers';
import type { SteeringMode } from '../utils/steering';
import { resolveSteering } from '../utils/steering';
import { createCanvas2DRenderer } from '../render/canvas2dRenderer';
import { createThreeRenderer } from '../render/threeRenderer';

// IA y hooks
import { AI_PARAMS, decideNextDirection } from '../ai/simpleAI';
import { useIsMobile } from '../hooks/useIsMobile';

// Componentes UI
import { DPadOverlay } from './DPadOverlay';
import { GameOverlay } from './GameOverlay';

// Estilos
import '../styles/gameCanvasOverlay.css';
import '../styles/gameUI.css';

export function GameCanvas(): JSX.Element {
  // Loop timing
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const logicStepMilliseconds = 100; // 10 Hz
  /** At most this much elapsed time is replayed in one frame (3 logic ticks). */
  const MAXIMUM_CATCH_UP_MILLISECONDS = 300;
  const tickCounterRef = useRef<number>(0);

  // Renderers (2D board, 3D cockpit, plus the little 2D map shown in 3D)
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapRendererRef = useRef<GameRenderer | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>(loadRenderMode);

  // Grid
  const gridRef = useRef<GridConfig>({
    columns: GRID_CONFIG.columns,
    rows: GRID_CONFIG.rows,
  });

  // Lattices
  const occupancyLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(gridRef.current.rows, gridRef.current.columns)
  );
  const playerOneLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(gridRef.current.rows, gridRef.current.columns)
  );
  const playerTwoLatticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(gridRef.current.rows, gridRef.current.columns)
  );

  // Game meta
  const [gameState, setGameState] = useState<GameState>('menu');
  const [level, setLevel] = useState<number>(1);
  const [lives, setLives] = useState<number>(INITIAL_LIVES);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(loadHighScoreMax);
  const [playerName, setPlayerName] = useState<string | null>(loadPlayerName);
  const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>(() =>
    loadHighScores()
  );

  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);

  // Inline "save your score" form shown on game over when no name is stored yet
  const [needsNameForSave, setNeedsNameForSave] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>('');
  const pendingScoreRef = useRef<number>(0);

  // Razón del fin de la run (solo para el overlay final)
  const gameOverReasonRef = useRef<'victory' | 'outOfLives' | 'none'>('none');

  // Evitar doble guardado al final de la run
  const savedThisRunRef = useRef<boolean>(false);
  const isMobile = useIsMobile();

  // Spawns
  const playerSpawn: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(gridRef.current.columns / 2),
      rowIndexInCells: gridRef.current.rows - 6,
    }),
    []
  );
  const botSpawn: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(gridRef.current.columns / 2),
      rowIndexInCells: 6,
    }),
    []
  );

  // Players
  const playerOneRef = useRef<Player>({
    id: 1,
    name: 'Player One',
    color: '#ffc23a',
    headLatticeIndex: toLatticeVertexIndices(playerSpawn),
    previousHeadLatticeIndex: toLatticeVertexIndices(playerSpawn),
    direction: 'up',
    pendingDirection: 'up',
    isAlive: true,
    ticksSurvived: 0,
  });
  const playerTwoRef = useRef<Player>({
    id: 2,
    name: 'Bot',
    color: '#31d7ff',
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
   * bike faces south.
   */
  const steeringMode: SteeringMode = renderMode === '3d' ? 'relative' : 'absolute';

  // Round reset (keeps lives/level/score)
  const resetRound = useCallback((): void => {
    occupancyLatticeRef.current = createEmptyLattice(
      gridRef.current.rows,
      gridRef.current.columns
    );
    playerOneLatticeRef.current = createEmptyLattice(
      gridRef.current.rows,
      gridRef.current.columns
    );
    playerTwoLatticeRef.current = createEmptyLattice(
      gridRef.current.rows,
      gridRef.current.columns
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

    setOverlayMessage(null);
    savedThisRunRef.current = false;
    tickCounterRef.current = 0;

    // Drop the walls the 3D scene built during the previous round and re-anchor
    // the frame clock so the first frame after a reset doesn't jump.
    rendererRef.current?.resetRound();
    minimapRendererRef.current?.resetRound();
    accumulatedMilliseconds.current = 0;
    lastFrameTimestamp.current = 0;
  }, [playerSpawn, botSpawn]);

  // New run (after gameOver)
  const startNewRun = useCallback((): void => {
    setLevel(1);
    setLives(INITIAL_LIVES);
    setScore(0);
    setNeedsNameForSave(false);
    setGameState('playing');
    resetRound();
  }, [resetRound]);

  /** Starts a fresh run in the chosen view and remembers it for next time. */
  const startRunInMode = useCallback(
    (mode: RenderMode): void => {
      setRenderMode(mode);
      saveRenderMode(mode);
      startNewRun();
    },
    [startNewRun]
  );

  // Movement
  function moveOnePlayer(playerRef: React.MutableRefObject<Player>): void {
    applyPendingDirection(playerRef);

    const fromVertex = playerRef.current.headLatticeIndex;
    const { traversedEdgeCellInLattice, destinationVertexInLattice } =
      stepOnLattice(fromVertex, playerRef.current.direction);

    if (
      !isInsideLattice(traversedEdgeCellInLattice, gridRef.current) ||
      !isInsideLattice(destinationVertexInLattice, gridRef.current) ||
      isOccupied(occupancyLatticeRef.current, traversedEdgeCellInLattice) ||
      isOccupied(occupancyLatticeRef.current, destinationVertexInLattice)
    ) {
      playerRef.current.isAlive = false;
      // Crashing leaves the head where it is, so collapse the interpolation
      // segment: the 3D bike parks on its last vertex instead of sliding on.
      playerRef.current.previousHeadLatticeIndex = fromVertex;
      return;
    }

    occupy(occupancyLatticeRef.current, fromVertex);
    occupy(occupancyLatticeRef.current, traversedEdgeCellInLattice);

    const perPlayer =
      playerRef.current.id === 1
        ? playerOneLatticeRef.current
        : playerTwoLatticeRef.current;
    occupy(perPlayer, fromVertex);
    occupy(perPlayer, traversedEdgeCellInLattice);

    playerRef.current.previousHeadLatticeIndex = fromVertex;
    playerRef.current.headLatticeIndex = destinationVertexInLattice;
    playerRef.current.ticksSurvived += 1;
  }

  // Round end flow (win/lose) — saves score in roundEnd only
  function endRoundWithResult(roundOutcome: 'win' | 'lose'): void {
    if (roundOutcome === 'win') {
      setScore((previousScore) => previousScore + bonusForLevel(level));
      setOverlayMessage('You win! Level cleared.');
    } else {
      setOverlayMessage('Bot wins! You crashed.');
    }

    // Transition to roundEnd (the run is still ongoing)
    setGameState('roundEnd');
  }

  /**
   * Manual reset (R key / on-screen Reset button) during play counts as a
   * lost round, same as a crash. Without this, resetting right before a
   * crash would dodge losing a life for free, making lives meaningless.
   */
  function handleManualReset(): void {
    if (gameState !== 'playing') return;
    setOverlayMessage('Round reset — life lost.');
    setGameState('roundEnd');
  }

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
    gameOverReasonRef.current = runResult;
    pendingScoreRef.current = score; // level bonus already included earlier if win

    if (playerName) {
      persistScore(playerName);
      setNeedsNameForSave(false);
    } else {
      setNeedsNameForSave(true);
    }

    // Show proper overlay depending on run result
    if (runResult === 'victory') {
      setOverlayMessage('Run Complete! Champion.');
    } else {
      setOverlayMessage('Game Over');
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

  // Per-tick logic
  function updateLogic(): void {
    if (gameState !== 'playing') return;

    // Player
    if (playerOneRef.current.isAlive) moveOnePlayer(playerOneRef);
    if (!playerOneRef.current.isAlive) {
      endRoundWithResult('lose');
      return;
    }

    // Bot decision cadence by difficulty
    const params = AI_PARAMS[currentDifficulty()];
    // Math.max guards against a 0 cadence: n % 0 is NaN, which would silently
    // disable the bot's decision-making for that difficulty.
    const decisionCadence = Math.max(1, params.decisionEveryNTicks);
    if (
      playerTwoRef.current.isAlive &&
      tickCounterRef.current % decisionCadence === 0
    ) {
      const aiView = {
        grid: gridRef.current,
        lattice: occupancyLatticeRef.current,
        self: playerTwoRef.current,
        opponent: playerOneRef.current,
      };
      playerTwoRef.current.pendingDirection = decideNextDirection(
        aiView,
        currentDifficulty()
      );
    }

    // Bot move
    if (playerTwoRef.current.isAlive) moveOnePlayer(playerTwoRef);
    if (!playerTwoRef.current.isAlive) {
      endRoundWithResult('win');
      return;
    }

    tickCounterRef.current += 1;

    if (tickCounterRef.current % 10 === 0) {
      setScore((previousScore) => previousScore + pointsPerSecond(level));
    }
  }

  /**
   * Snapshot of the round in render-agnostic terms.
   * `interpolationAlpha` is how far the heads have travelled inside the current
   * logic tick: the 2D board ignores it, the 3D cockpit rides on it.
   */
  function buildRenderFrame(interpolationAlpha: number): RenderFrame {
    return {
      grid: gridRef.current,
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
      controlsHint:
        isMobile || renderMode !== '2d'
          ? null
          : 'Controls — Move: Arrows/WASD | Reset: R',
    };
  }

  // Main renderer lifecycle. Kept out of the loop effect so switching level or
  // game state never tears down the 3D scene.
  useEffect(() => {
    const canvas = canvasReference.current;
    if (!canvas) return;

    let renderer: GameRenderer;
    if (renderMode === '3d') {
      try {
        renderer = createThreeRenderer(canvas, gridRef.current, {
          enableBloom: !isMobile,
        });
      } catch (error) {
        // No WebGL (old device, blocked context): fall back to the 2D board
        // rather than leaving the player staring at a blank canvas.
        console.warn('3D view unavailable, falling back to 2D:', error);
        setRenderMode('2d');
        return;
      }
    } else {
      renderer = createCanvas2DRenderer(canvas, gridRef.current);
    }

    rendererRef.current = renderer;
    renderer.resize();

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [renderMode, isMobile]);

  // Minimap: the 2D board reused at postage-stamp size, so the cockpit view
  // doesn't cost the player all arena awareness.
  useEffect(() => {
    const minimapCanvas = minimapCanvasReference.current;
    if (renderMode !== '3d' || !minimapCanvas) return;

    const minimapRenderer = createCanvas2DRenderer(
      minimapCanvas,
      gridRef.current,
      { sizing: 'match-css-size' }
    );
    minimapRendererRef.current = minimapRenderer;
    minimapRenderer.resize();

    return () => {
      minimapRenderer.dispose();
      minimapRendererRef.current = null;
    };
  }, [renderMode]);

  // Loop + draw
  useEffect(() => {
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
        gameState === 'playing'
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
  }, [gameState, level, isMobile, renderMode]);

  // Inputs
  useEffect(() => {
    function keydownHandler(event: KeyboardEvent): void {
      if (
        gameState === 'menu' &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        startRunInMode(renderMode);
        return;
      }
      // Game keys only apply mid-round; otherwise typing in overlay inputs
      // (e.g. the letter "r" in a player name) would reset the board.
      if (gameState !== 'playing') return;
      handleKeyDownBase(
        event,
        playerOneRef as React.MutableRefObject<PlayerForInput>,
        handleManualReset,
        steeringMode
      );
    }
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, renderMode, startRunInMode]);

  // RoundEnd actions
  /**
   * Handles the transition from "roundEnd" to the next state.
   * - If player won → next level (or finalize run if last level)
   * - If player lost → lose a life (or finalize run if no lives left)
   */
  function handleRoundEndPrimary(): void {
    const playerWonRound = overlayMessage?.startsWith('You win') ?? false;

    if (playerWonRound) {
      // Last level completed → finalize run
      const isLastLevel = level >= LEVEL_COUNT;
      if (isLastLevel) {
        finalizeRunAndSave('victory');
        return;
      }

      // Advance to next level
      const nextLevelValue = Math.min(level + 1, LEVEL_COUNT);
      setLevel(nextLevelValue);
      setGameState('playing');
      resetRound();
      return;
    }

    // Player lost → remove a life
    const remainingLives = lives - 1;
    if (remainingLives <= 0) {
      // No lives left → end run
      setLives(0);
      finalizeRunAndSave('outOfLives');
      return;
    }

    // Still has lives → retry current level
    setLives(remainingLives);
    setGameState('playing');
    resetRound();
  }

  function handleGameOverPrimary(): void {
    startNewRun();
  }

  /** Back to the menu with a clean arena, so the view can be switched. */
  function handleBackToMenu(): void {
    setGameState('menu');
    resetRound();
  }

  function handleTouchDirection(
    direction: 'up' | 'down' | 'left' | 'right'
  ): void {
    if (gameState !== 'playing') return;

    playerOneRef.current.pendingDirection = resolveSteering(
      direction,
      playerOneRef.current.direction,
      steeringMode
    );
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
    </div>
  );

  /**
   * Computes the overlay copy and actions depending on the current game state.
   * Centralizes all overlay variants to avoid repeated JSX.
   */
  function getOverlayConfig(): {
    title: string;
    paragraph?: string;
    primaryLabel?: string;
    onPrimary?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    showLeaderboard: boolean;
    extraContent?: React.ReactNode;
    styleOverride?: React.CSSProperties;
  } {
    const isWinMessage = overlayMessage?.startsWith('You win') ?? false;

    if (gameState === 'menu') {
      return {
        title: 'Lightcycle Arena',
        paragraph:
          '2D Classic: arrows steer by compass · 3D Cockpit: left/right turn the bike · R resets',
        primaryLabel: '2D Classic',
        onPrimary: () => startRunInMode('2d'),
        secondaryLabel: '3D Cockpit',
        onSecondary: () => startRunInMode('3d'),
        showLeaderboard: true,
        extraContent: (
          <p className='menu-hint'>
            Enter starts in the last view used ({viewLabel})
          </p>
        ),
        styleOverride: { background: 'rgba(0,0,0,0.65)' },
      };
    }

    if (gameState === 'roundEnd') {
      return {
        title: overlayMessage || (isWinMessage ? 'You win!' : 'Round Over'),
        paragraph: isWinMessage
          ? 'Press Next to continue'
          : 'Press Retry to continue',
        primaryLabel: isWinMessage ? 'Next Level' : 'Retry',
        onPrimary: handleRoundEndPrimary,
        showLeaderboard: true,
        // no extraContent here
      };
    }

    if (gameState === 'gameOver') {
      const title =
        gameOverReasonRef.current === 'victory' ? 'Run Complete' : 'Game Over';

      return {
        title,
        paragraph: undefined,
        primaryLabel: 'Play Again',
        onPrimary: handleGameOverPrimary,
        secondaryLabel: 'Menu',
        onSecondary: handleBackToMenu,
        showLeaderboard: true,
        extraContent: (
          <>
            <p style={{ marginTop: 6 }}>Your final score: {formattedScore}</p>
            {needsNameForSave && (
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
            )}
          </>
        ),
      };
    }

    // Fallback
    return {
      title: '',
      showLeaderboard: false,
    };
  }

  // Same as the HUD: computed JSX instead of a nested component, so overlay
  // children (like the save-score input) keep focus across re-renders.
  const overlayConfig = gameState !== 'playing' ? getOverlayConfig() : null;
  const stateOverlay = overlayConfig ? (
    <GameOverlay
      title={overlayConfig.title}
      paragraph={overlayConfig.paragraph}
      primaryLabel={overlayConfig.primaryLabel}
      onPrimary={overlayConfig.onPrimary}
      secondaryLabel={overlayConfig.secondaryLabel}
      onSecondary={overlayConfig.onSecondary}
      showLeaderboard={overlayConfig.showLeaderboard}
      leaderboardEntries={leaderboard}
      maxRows={5}
      extraContent={overlayConfig.extraContent}
      styleOverride={overlayConfig.styleOverride}
    />
  ) : null;

  // The canvas is keyed by view: a canvas that already handed out a 2D context
  // can never give a WebGL one, so switching views needs a brand new element.
  const arena = (
    <div
      className={
        renderMode === '3d' ? 'canvas-zone canvas-zone-3d' : 'canvas-zone'
      }
    >
      <canvas
        key={renderMode}
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
