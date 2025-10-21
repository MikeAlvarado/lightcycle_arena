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
import '../styles/gameUI.css'; // we reuse HUD styles, but as overlay

export function GameCanvas(): JSX.Element {
  // Canvas & loop
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const logicStepMilliseconds = 100;
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

  // HUD state (placeholder demo values)
  const [score, setScore] = useState(0);
  const [lives] = useState(3);
  const [highScore] = useState(2000);

  // UI overlay message
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);
  const gameIsRunningRef = useRef<boolean>(true);

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

  const botDifficulty: AiDifficulty = 'Hard';
  const isMobile = useIsMobile();

  // Reset
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

    gameIsRunningRef.current = true;
    setOverlayMessage(null);
    tickCounterRef.current = 0;
    setScore(0);
  }, [playerSpawn, botSpawn]);

  // Logic
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

  function updateLogic(): void {
    if (!gameIsRunningRef.current) return;

    // Human
    if (playerOneRef.current.isAlive) moveOnePlayer(playerOneRef);
    if (!playerOneRef.current.isAlive) {
      gameIsRunningRef.current = false;
      setOverlayMessage('Bot wins! You crashed.');
      return;
    }

    // AI
    const params = AI_PARAMS[botDifficulty];
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
        botDifficulty
      );
    }
    if (playerTwoRef.current.isAlive) moveOnePlayer(playerTwoRef);

    if (!playerTwoRef.current.isAlive) {
      gameIsRunningRef.current = false;
      setOverlayMessage('You win! The bot crashed.');
      return;
    }

    tickCounterRef.current += 1;
    // Basic demo scoring: +10 per logic step second (approx)
    if (tickCounterRef.current % 10 === 0) setScore((s) => s + 10);
  }

  // Resize to parent
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

  // Effect A
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

      // Optional debug overlay drawn on canvas
      drawOverlay(
        context,
        gridRef.current,
        tickCounterRef.current,
        gameIsRunningRef.current,
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
  }, [resizeCanvasKeepingGridAspect, overlayMessage]);

  // Effect B: inputs
  useEffect(() => {
    function keydownHandler(event: KeyboardEvent): void {
      handleKeyDownBase(
        event,
        playerOneRef as React.MutableRefObject<PlayerForInput>,
        resetRound
      );
    }
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
  }, [resetRound]);

  function handleTouchDirection(
    direction: 'up' | 'down' | 'left' | 'right'
  ): void {
    playerOneRef.current.pendingDirection = direction;
  }

  // HUD overlay node (does not consume layout height)
  const hearts = '❤'.repeat(lives).padEnd(3, '♡');
  const formattedScore = score.toString().padStart(8, '0');
  const formattedHighScore = highScore.toString().padStart(8, '0');

  function HudOverlay() {
    return (
      <div className='game-ui hud-overlay'>
        <h1 className='game-title'>Lightcycle Arena</h1>
        <div className='hud-container'>
          <div className='hud-row'>
            <span className='hud-lives'>Lives: {hearts}</span>
            <span className='hud-highscore-label'>High Score</span>
          </div>
          <div className='hud-row'>
            <span className='hud-score'>Score: {formattedScore}</span>
            <span className='hud-highscore-value'>{formattedHighScore}</span>
          </div>
        </div>
      </div>
    );
  }

  // Render
  // inside GameCanvas component
  return isMobile ? (
    <div className='mobile-stage'>
      {/* HUD stays visible on top */}
      <div className='hud-zone'>
        <div className='game-ui'>
          <h1 className='game-title'>Lightcycle Arena</h1>
          <div className='hud-container'>
            <div className='hud-row'>
              <span className='hud-lives'>Lives: {'❤'.repeat(3)}</span>
              <span className='hud-highscore-label'>High Score</span>
            </div>
            <div className='hud-row'>
              <span className='hud-score'>Score: 00000000</span>
              <span className='hud-highscore-value'>00002000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas zone (50%) */}
      <div className='canvas-zone'>
        <canvas ref={canvasReference} />
        {overlayMessage && (
          <div className='canvas-overlay'>
            <h2>{overlayMessage}</h2>
            <p>Press R or tap Reset to play again</p>
            <button onClick={resetRound}>Reset</button>
          </div>
        )}
      </div>

      {/* DPad zone (remaining 50%) */}
      <div className='controls-zone'>
        <DPadOverlay onInput={handleTouchDirection} onReset={resetRound} />
      </div>
    </div>
  ) : (
    <div className='game-stage'>
      {/* HUD (2/8 height) */}
      <div className='hud-zone'>
        <div className='game-ui'>
          <h1 className='game-title'>Lightcycle Arena</h1>
          <div className='hud-container'>
            <div className='hud-row'>
              <span className='hud-lives'>Lives: {'❤'.repeat(3)}</span>
              <span className='hud-highscore-label'>High Score</span>
            </div>
            <div className='hud-row'>
              <span className='hud-score'>Score: 00000000</span>
              <span className='hud-highscore-value'>00002000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas (6/8 height) */}
      <div className='canvas-zone'>
        <canvas ref={canvasReference} />
        {overlayMessage && (
          <div className='canvas-overlay'>
            <h2>{overlayMessage}</h2>
            <p>Press R or tap Reset to play again</p>
            <button onClick={resetRound}>Reset</button>
          </div>
        )}
      </div>
    </div>
  );
}
