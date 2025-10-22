import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { GRID_CONFIG, type GridConfig } from '../utils/gridConfig';
import {
  createEmptyLattice,
  toLatticeVertexIndices,
  stepOnLattice,
  isInsideLattice,
  isOccupied,
  occupy,
  applyPendingDirection,
  type LatticeMatrix,
  type LogicalVertex,
} from '../utils/latticeHelpers';
import { handleKeyDown as handleKeyDownBase } from '../utils/inputHandlers';
import {
  drawGrid,
  drawLatticeTrails,
  drawHeadAtLatticeVertex,
  drawOverlay,
} from '../utils/canvasDrawing';
import type { Player, PlayerForInput } from '../types/player';
import {
  decideNextDirection,
  AI_PARAMS,
  type AiDifficulty,
} from '../ai/simpleAI';
import { useIsMobile } from '../hooks/useIsMobile';
import { DPadOverlay } from './DPadOverlay';
import '../styles/gameCanvasOverlay.css';
import '../styles/gameUI.css';
import type { HighScoreEntry } from '../types/game';
import { GameOverlay } from './GameOverlay';

import type { GameState } from '../types/game';
import {
  INITIAL_LIVES,
  LEVEL_COUNT,
  difficultyForLevel,
  bonusForLevel,
  pointsPerSecond,
} from '../config/levels';
import {
  loadPlayerName,
  savePlayerName,
  loadHighScores,
  tryInsertHighScore,
  loadHighScoreMax,
} from '../utils/storage';

export function GameCanvas(): JSX.Element {
  // Loop timing
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const logicStepMilliseconds = 100; // 10 Hz
  const tickCounterRef = useRef<number>(0);

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
  const [highScore, setHighScore] = useState<number>(loadHighScoreMax());
  const [playerName, setPlayerName] = useState<string | null>(loadPlayerName());
  const [leaderboard, setLeaderboard] = useState<HighScoreEntry[]>(() =>
    loadHighScores()
  );

  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
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
    color: 'yellow',
    headLatticeIndex: toLatticeVertexIndices(playerSpawn),
    direction: 'up',
    pendingDirection: 'up',
    isAlive: true,
    ticksSurvived: 0,
  });
  const playerTwoRef = useRef<Player>({
    id: 2,
    name: 'Bot',
    color: 'blue',
    headLatticeIndex: toLatticeVertexIndices(botSpawn),
    direction: 'down',
    pendingDirection: 'down',
    isAlive: true,
    ticksSurvived: 0,
  });

  // Difficulty by level
  const currentDifficulty = (): AiDifficulty => difficultyForLevel(level);

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
    playerOneRef.current.direction = 'up';
    playerOneRef.current.pendingDirection = 'up';
    playerOneRef.current.isAlive = true;
    playerOneRef.current.ticksSurvived = 0;

    playerTwoRef.current.headLatticeIndex = toLatticeVertexIndices(botSpawn);
    playerTwoRef.current.direction = 'down';
    playerTwoRef.current.pendingDirection = 'down';
    playerTwoRef.current.isAlive = true;
    playerTwoRef.current.ticksSurvived = 0;

    setOverlayMessage(null);
    savedThisRunRef.current = false;
    tickCounterRef.current = 0;
  }, [playerSpawn, botSpawn]);

  // New run (after gameOver)
  const startNewRun = useCallback((): void => {
    setLevel(1);
    setLives(INITIAL_LIVES);
    setScore(0);
    setGameState('playing');
    resetRound();
  }, [resetRound]);

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
   * Finalizes the full run (after losing all lives or clearing all levels).
   * It asks for the player's name (if missing) and saves their high score locally.
   */
  function finalizeRunAndSave(runResult: 'victory' | 'outOfLives'): void {
    // Prevent duplicate saving or prompts
    if (savedThisRunRef.current) return;
    savedThisRunRef.current = true;
    gameOverReasonRef.current = runResult;

    let currentPlayerName = playerName;

    // Ask for player name only if it doesn't exist
    if (!currentPlayerName) {
      const enteredName = window
        .prompt('Enter your name to save the score:', '')
        ?.trim();
      if (enteredName && enteredName.length > 0) {
        currentPlayerName = enteredName.slice(0, 20);
        setPlayerName(currentPlayerName);
        savePlayerName(currentPlayerName);
      }
    }

    // Save score if player name is available
    if (currentPlayerName) {
      const finalScoreValue = score; // level bonus already included earlier if win
      const updatedHighScores = tryInsertHighScore({
        name: currentPlayerName,
        score: finalScoreValue,
        dateISO: new Date().toISOString(),
      });

      // Update local states so UI reflects the latest leaderboard without reload
      setLeaderboard(updatedHighScores);

      const highestScore = updatedHighScores.length
        ? Math.max(...updatedHighScores.map((entry) => entry.score))
        : 0;
      setHighScore(highestScore);
    }

    // Show proper overlay depending on run result
    if (runResult === 'victory') {
      setOverlayMessage('Run Complete! Champion.');
    } else {
      setOverlayMessage('Game Over');
    }
    setGameState('gameOver');
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
    if (
      playerTwoRef.current.isAlive &&
      tickCounterRef.current % params.decisionEveryNTicks === 0
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

  // Resize canvas to parent
  const resizeCanvasKeepingGridAspect = useCallback(() => {
    const canvas = canvasReference.current!;
    const parent = canvas.parentElement as HTMLElement;
    const aspect = gridRef.current.rows / gridRef.current.columns;

    const availableWidth = parent.clientWidth;
    const availableHeight = parent.clientHeight;

    let targetWidth = Math.min(
      availableWidth,
      Math.floor(availableHeight / aspect)
    );
    let targetHeight = Math.floor(targetWidth * aspect);

    targetWidth = Math.max(240, targetWidth);
    targetHeight = Math.max(180, targetHeight);

    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }, []);

  // Loop + draw
  useEffect(() => {
    const canvas = canvasReference.current!;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;

    function animationLoop(currentTimestamp: number): void {
      if (!lastFrameTimestamp.current)
        lastFrameTimestamp.current = currentTimestamp;

      const elapsed = currentTimestamp - lastFrameTimestamp.current;
      lastFrameTimestamp.current = currentTimestamp;
      accumulatedMilliseconds.current += elapsed;

      while (accumulatedMilliseconds.current >= logicStepMilliseconds) {
        updateLogic();
        accumulatedMilliseconds.current -= logicStepMilliseconds;
      }

      drawGrid(context, canvas.width, canvas.height, gridRef.current);
      drawLatticeTrails(
        context,
        canvas.width,
        canvas.height,
        gridRef.current,
        playerOneLatticeRef.current,
        playerOneRef.current.color
      );
      drawLatticeTrails(
        context,
        canvas.width,
        canvas.height,
        gridRef.current,
        playerTwoLatticeRef.current,
        playerTwoRef.current.color
      );
      drawHeadAtLatticeVertex(
        context,
        canvas.width,
        canvas.height,
        gridRef.current,
        playerOneRef.current.headLatticeIndex,
        playerOneRef.current.color
      );
      drawHeadAtLatticeVertex(
        context,
        canvas.width,
        canvas.height,
        gridRef.current,
        playerTwoRef.current.headLatticeIndex,
        playerTwoRef.current.color
      );

      drawOverlay(
        context,
        gridRef.current,
        tickCounterRef.current,
        gameState === 'playing',
        overlayMessage ?? ''
      );

      requestIdReference.current = requestAnimationFrame(animationLoop);
    }

    resizeCanvasKeepingGridAspect();
    const onResize = () => resizeCanvasKeepingGridAspect();
    window.addEventListener('resize', onResize);
    requestIdReference.current = requestAnimationFrame(animationLoop);

    return () => {
      cancelAnimationFrame(requestIdReference.current);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizeCanvasKeepingGridAspect, overlayMessage, gameState, level]);

  // Inputs
  useEffect(() => {
    function keydownHandler(event: KeyboardEvent): void {
      if (
        gameState === 'menu' &&
        (event.key === 'Enter' || event.key === ' ')
      ) {
        setGameState('playing');
        resetRound();
        return;
      }
      handleKeyDownBase(
        event,
        playerOneRef as React.MutableRefObject<PlayerForInput>,
        resetRound
      );
    }
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
  }, [resetRound, gameState]);

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

  function handleTouchDirection(
    direction: 'up' | 'down' | 'left' | 'right'
  ): void {
    if (gameState === 'playing')
      playerOneRef.current.pendingDirection = direction;
  }

  // HUD
  const hearts = '❤'.repeat(Math.max(0, lives));
  const formattedScore = score.toString().padStart(8, '0');
  const formattedHighScore = highScore.toString().padStart(8, '0');

  function Hud() {
    return (
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
            <span>Mode: {currentDifficulty()}</span>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Computes the overlay copy and actions depending on the current game state.
   * Centralizes all overlay variants to avoid repeated JSX.
   */
  function getOverlayConfig(): {
    title: string;
    paragraph?: string;
    primaryLabel?: string;
    onPrimary?: () => void;
    showLeaderboard: boolean;
    extraContent?: React.ReactNode;
    styleOverride?: React.CSSProperties;
  } {
    const isWinMessage = overlayMessage?.startsWith('You win') ?? false;

    if (gameState === 'menu') {
      return {
        title: 'Lightcycle Arena',
        paragraph: 'Press Enter to start',
        primaryLabel: 'Start',
        onPrimary: () => {
          setGameState('playing');
          resetRound();
        },
        showLeaderboard: true,
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
        showLeaderboard: true,
        extraContent: (
          <p style={{ marginTop: 6 }}>Your final score: {formattedScore}</p>
        ),
      };
    }

    // Fallback
    return {
      title: '',
      showLeaderboard: false,
    };
  }

  function StateOverlay(): JSX.Element | null {
    // Nothing to render while actively playing
    if (gameState === 'playing') return null;

    // Decide content based on state
    const {
      title,
      paragraph,
      primaryLabel,
      onPrimary,
      showLeaderboard,
      extraContent,
      styleOverride,
    } = getOverlayConfig();

    return (
      <GameOverlay
        title={title}
        paragraph={paragraph}
        primaryLabel={primaryLabel}
        onPrimary={onPrimary}
        showLeaderboard={showLeaderboard}
        leaderboardEntries={leaderboard}
        maxRows={5}
        extraContent={extraContent}
        styleOverride={styleOverride}
      />
    );
  }

  // Render (flex layout ya configurado en tu index.css)
  return isMobile ? (
    <div className='mobile-stage'>
      <div className='hud-zone'>
        <Hud />
      </div>
      <div className='canvas-zone'>
        <canvas ref={canvasReference} />
        <StateOverlay />
      </div>
      <div className='controls-zone'>
        <DPadOverlay onInput={handleTouchDirection} onReset={resetRound} />
      </div>
    </div>
  ) : (
    <div className='game-stage'>
      <div className='hud-zone'>
        <Hud />
      </div>
      <div className='canvas-zone'>
        <canvas ref={canvasReference} />
        <StateOverlay />
      </div>
    </div>
  );
}
