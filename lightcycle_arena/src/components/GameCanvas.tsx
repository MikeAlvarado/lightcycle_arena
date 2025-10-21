// src/components/GameCanvas.tsx
import type { MutableRefObject } from "react";
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
import "../styles/gameCanvasOverlay.css";


/**
 * GameCanvas — Two Players (Human + Simple AI) on 2x Lattice
 * - Separate lattices for rendering (per player color).
 * - One occupancy lattice for collisions and AI safety checks.
 */
export function GameCanvas(): JSX.Element {
  // Canvas & loop
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const logicStepMilliseconds = 100; // 10 updates per second
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

  // Game state
  const gameIsRunningRef = useRef<boolean>(true);
  const resultMessageRef = useRef<string>('');
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);


  // Spawn positions (memo to keep stable references)
  const initialLogicalVertex: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(gridRef.current.columns / 2), // middle horizontally
      rowIndexInCells: gridRef.current.rows - 6, // bottom area
    }),
    []
  );
  const botSpawnLogicalVertex: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: Math.floor(gridRef.current.columns / 2), // middle horizontally
      rowIndexInCells: 6, // top area
    }),
    []
  );

  // Human player
  const playerOneRef = useRef<Player>({
    id: 1,
    name: 'Player One',
    color: 'yellow',
    headLatticeIndex: toLatticeVertexIndices(initialLogicalVertex),
    direction: 'up',
    pendingDirection: 'up',
    isAlive: true,
    ticksSurvived: 0,
  });

  // AI player
  const playerTwoRef = useRef<Player>({
    id: 2,
    name: 'Bot',
    color: 'blue',
    headLatticeIndex: toLatticeVertexIndices(botSpawnLogicalVertex),
    direction: 'down',
    pendingDirection: 'down',
    isAlive: true,
    ticksSurvived: 0,
  });

  // Difficulty (can be moved to HUD later)
  const botDifficulty: AiDifficulty = 'Hard';

  const isMobile = useIsMobile();

  // ---------- reset ----------
  const resetRound = useCallback((): void => {
    // Lattices
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

    // Human
    playerOneRef.current.headLatticeIndex =
      toLatticeVertexIndices(initialLogicalVertex);
    playerOneRef.current.direction = 'up';
    playerOneRef.current.pendingDirection = 'up';
    playerOneRef.current.isAlive = true;
    playerOneRef.current.ticksSurvived = 0;

    // Bot
    playerTwoRef.current.headLatticeIndex = toLatticeVertexIndices(
      botSpawnLogicalVertex
    );
    playerTwoRef.current.direction = 'down';
    playerTwoRef.current.pendingDirection = 'down';
    playerTwoRef.current.isAlive = true;
    playerTwoRef.current.ticksSurvived = 0;

    // Game state
    setOverlayMessage(null);
    gameIsRunningRef.current = true;
    resultMessageRef.current = '';
    tickCounterRef.current = 0;

    // Prevent old key inputs from persisting
    window.focus();
  }, [initialLogicalVertex, botSpawnLogicalVertex]);

  // ---------- logic ----------
  function moveOnePlayer(playerRef: MutableRefObject<Player>): void {
    applyPendingDirection(playerRef);

    const fromVertex = playerRef.current.headLatticeIndex;
    const { traversedEdgeCellInLattice, destinationVertexInLattice } =
      stepOnLattice(fromVertex, playerRef.current.direction);

    // Bounds or collision against global occupancy
    if (
      !isInsideLattice(traversedEdgeCellInLattice, gridRef.current) ||
      !isInsideLattice(destinationVertexInLattice, gridRef.current) ||
      isOccupied(occupancyLatticeRef.current, traversedEdgeCellInLattice) ||
      isOccupied(occupancyLatticeRef.current, destinationVertexInLattice)
    ) {
      playerRef.current.isAlive = false;
      return;
    }

    // Leave global trail (for collisions)
    occupy(occupancyLatticeRef.current, fromVertex);
    occupy(occupancyLatticeRef.current, traversedEdgeCellInLattice);

    // Leave per-player trail (for colored rendering)
    const perPlayerLattice =
      playerRef.current.id === 1
        ? playerOneLatticeRef.current
        : playerTwoLatticeRef.current;
    occupy(perPlayerLattice, fromVertex);
    occupy(perPlayerLattice, traversedEdgeCellInLattice);

    // Advance head
    playerRef.current.headLatticeIndex = destinationVertexInLattice;
    playerRef.current.ticksSurvived += 1;
  }

  function updateLogic(): void {
    if (!gameIsRunningRef.current) return;

    // 1) Human moves first
    if (playerOneRef.current.isAlive) {
      moveOnePlayer(playerOneRef);
    }

    // If human crashed, end if bot still alive
    if (!playerOneRef.current.isAlive) {
      gameIsRunningRef.current = false;
      resultMessageRef.current = 'Bot wins! You crashed.';
      setOverlayMessage(resultMessageRef.current);
      return;
    }

    // 2) AI decision cadence
    const params = AI_PARAMS[botDifficulty];
    if (
      playerTwoRef.current.isAlive &&
      tickCounterRef.current % params.decisionEveryNTicks === 0
    ) {
      const aiView = {
        grid: gridRef.current,
        lattice: occupancyLatticeRef.current, // safety checks use the global occupancy
        self: playerTwoRef.current,
        opponent: playerOneRef.current,
      };
      const nextDirection = decideNextDirection(aiView, botDifficulty);
      playerTwoRef.current.pendingDirection = nextDirection;
    }

    // 3) Bot moves
    if (playerTwoRef.current.isAlive) {
      moveOnePlayer(playerTwoRef);
    }

    // If bot crashed, end with human victory
    if (!playerTwoRef.current.isAlive) {
      gameIsRunningRef.current = false;
      resultMessageRef.current = 'You win! The bot crashed.';
      setOverlayMessage(resultMessageRef.current); 
      return;
    }

    // Tick++
    tickCounterRef.current += 1;
  }

  // ---------- Effect A: canvas, resize, RAF ----------
  useEffect(() => {
    const canvasElement = canvasReference.current!;
    const context = canvasElement.getContext('2d') as CanvasRenderingContext2D;

    function resizeCanvasKeepingGridAspect(): void {
      const aspectRatio = gridRef.current.rows / gridRef.current.columns;
      const parent = canvasElement.parentElement as HTMLElement;
      const targetWidth = Math.min(parent.clientWidth, 900);
      const targetHeight = Math.floor(targetWidth * aspectRatio);
      canvasElement.width = targetWidth;
      canvasElement.height = targetHeight;
    }

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

      // ----- Drawing (grid → trails by player → heads → overlay) -----
      drawGrid(
        context,
        canvasElement.width,
        canvasElement.height,
        gridRef.current
      );
      drawLatticeTrails(
        context,
        canvasElement.width,
        canvasElement.height,
        gridRef.current,
        playerOneLatticeRef.current,
        playerOneRef.current.color
      );
      drawLatticeTrails(
        context,
        canvasElement.width,
        canvasElement.height,
        gridRef.current,
        playerTwoLatticeRef.current,
        playerTwoRef.current.color
      );
      drawHeadAtLatticeVertex(
        context,
        canvasElement.width,
        canvasElement.height,
        gridRef.current,
        playerOneRef.current.headLatticeIndex,
        playerOneRef.current.color
      );
      drawHeadAtLatticeVertex(
        context,
        canvasElement.width,
        canvasElement.height,
        gridRef.current,
        playerTwoRef.current.headLatticeIndex,
        playerTwoRef.current.color
      );
      drawOverlay(
        context,
        gridRef.current,
        tickCounterRef.current,
        gameIsRunningRef.current,
        resultMessageRef.current
      );

      requestIdReference.current = requestAnimationFrame(animationLoop);
    }

    resizeCanvasKeepingGridAspect();
    window.addEventListener('resize', resizeCanvasKeepingGridAspect);
    requestIdReference.current = requestAnimationFrame(animationLoop);

    return () => {
      cancelAnimationFrame(requestIdReference.current);
      window.removeEventListener('resize', resizeCanvasKeepingGridAspect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Effect B: INPUTS ----------
  useEffect(() => {
    function keydownHandler(event: KeyboardEvent): void {
      handleKeyDownBase(
        event,
        playerOneRef as MutableRefObject<PlayerForInput>,
        resetRound
      );
    }
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
  }, [resetRound]);

  function handleTouchDirection(
    direction: 'up' | 'down' | 'left' | 'right'
  ): void {
    // Buffer the input like keyboard does
    playerOneRef.current.pendingDirection = direction;
    // If the round had ended and user touches the dpad, you can optionally restart:
    // if (!gameIsRunningRef.current) resetRound();
  }

  // ---------- render ----------
return (
  <div style={{ position: "relative", width: "100%", border: "1px solid #222", borderRadius: 8 }}>
    <canvas ref={canvasReference} />
    
      {overlayMessage && (
        <div className="canvas-overlay">
          <h2>{overlayMessage}</h2>
          <p>Press R or tap Reset to play again</p>
          <button onClick={resetRound}>Reset</button>
        </div>
      )}


      {/* Mobile D-Pad (half screen, fixed at bottom) */}
      {isMobile && (
        <DPadOverlay onInput={handleTouchDirection} onReset={resetRound} />
      )}
  </div>
);

}
