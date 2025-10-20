// src/components/GameCanvas.tsx
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { GRID_CONFIG, type GridConfig } from '../utils/gridConfig';
import {
  createEmptyLattice,
  toLatticeVertexIndices,
  stepOnLattice,
  isInsideLattice,
  isOccupied,
  occupy,
  applyPendingDirection,
  type LatticeIndex,
  type LatticeMatrix,
  type Direction,
  type LogicalVertex,
} from '../utils/latticeHelpers';
import { handleKeyDown as handleKeyDownBase } from '../utils/inputHandlers';
import { drawFrame } from '../utils/canvasDrawing';
import type { Player, PlayerForInput } from '../types/player';

/**
 * GameCanvas — Single Player using 2x Lattice (TypeScript, explicit names)
 * -----------------------------------------------------------------------
 * - One boolean lattice for both edges and vertices.
 * - Head moves between lattice vertices (even, even).
 * - Collision if traversed edge OR destination vertex is occupied.
 */
export function GameCanvas(): JSX.Element {
  // Canvas & loop
  const canvasReference = useRef<HTMLCanvasElement | null>(null);
  const requestIdReference = useRef<number>(0);
  const lastFrameTimestamp = useRef<number>(0);
  const accumulatedMilliseconds = useRef<number>(0);
  const logicStepMilliseconds = 100; // 10 updates per second
  const tickCounterRef = useRef<number>(0);

  // Grid (constant for this component)
  const gridRef = useRef<GridConfig>({
    columns: GRID_CONFIG.columns,
    rows: GRID_CONFIG.rows,
  });

  // Lattice (2x) occupancy
  const latticeRef = useRef<LatticeMatrix>(
    createEmptyLattice(gridRef.current.rows, gridRef.current.columns)
  );

  // Game state
  const gameIsRunningRef = useRef<boolean>(true);
  const resultMessageRef = useRef<string>('');

  // Player
  const initialLogicalVertex: LogicalVertex = useMemo(
    () => ({
      columnIndexInCells: 5,
      rowIndexInCells: Math.floor(gridRef.current.rows / 2),
    }),
    []
  );

  // Player ref using our interface
  const playerOneRef = useRef<Player>({
    id: 1,
    name: 'Player One',
    color: '#00e5ff',

    headLatticeIndex: toLatticeVertexIndices(initialLogicalVertex),
    direction: 'right',
    pendingDirection: 'right',

    isAlive: true,
    ticksSurvived: 0,
  });

  // ---------- reset ----------
  const resetRound = useCallback((): void => {
    latticeRef.current = createEmptyLattice(
      gridRef.current.rows,
      gridRef.current.columns
    );

    playerOneRef.current.headLatticeIndex =
      toLatticeVertexIndices(initialLogicalVertex);
    playerOneRef.current.direction = 'right';
    playerOneRef.current.pendingDirection = 'right';
    playerOneRef.current.isAlive = true;
    playerOneRef.current.ticksSurvived = 0;

    gameIsRunningRef.current = true;
    resultMessageRef.current = '';
    tickCounterRef.current = 0;
  }, [initialLogicalVertex]);

  // ---------- logic ----------
  function updateLogic(): void {
    if (!gameIsRunningRef.current || !playerOneRef.current.isAlive) return;

    applyPendingDirection(playerOneRef);

    const fromVertex = playerOneRef.current.headLatticeIndex;
    const { traversedEdgeCellInLattice, destinationVertexInLattice } =
      stepOnLattice(fromVertex, playerOneRef.current.direction);

    if (
      !isInsideLattice(traversedEdgeCellInLattice, gridRef.current) ||
      !isInsideLattice(destinationVertexInLattice, gridRef.current)
    ) {
      playerOneRef.current.isAlive = false;
      gameIsRunningRef.current = false;
      resultMessageRef.current = `${playerOneRef.current.name} hit the wall. Press 'R' to reset.`;
      return;
    }

    if (
      isOccupied(latticeRef.current, traversedEdgeCellInLattice) ||
      isOccupied(latticeRef.current, destinationVertexInLattice)
    ) {
      playerOneRef.current.isAlive = false;
      gameIsRunningRef.current = false;
      resultMessageRef.current = `${playerOneRef.current.name} hit the trail. Press 'R' to reset.`;
      return;
    }

    occupy(latticeRef.current, fromVertex);
    occupy(latticeRef.current, traversedEdgeCellInLattice);

    playerOneRef.current.headLatticeIndex = destinationVertexInLattice;
    playerOneRef.current.ticksSurvived += 1;
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

      drawFrame({
        context,
        canvasWidth: canvasElement.width,
        canvasHeight: canvasElement.height,
        grid: gridRef.current,
        lattice: latticeRef.current,
        headLatticeIndex: playerOneRef.current.headLatticeIndex,
        headColor: playerOneRef.current.color,
        tickCounterValue: tickCounterRef.current,
        running: gameIsRunningRef.current,
        message: resultMessageRef.current,
      });

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
        playerOneRef as React.MutableRefObject<PlayerForInput>,
        resetRound
      );
    }
    window.addEventListener('keydown', keydownHandler);
    return () => window.removeEventListener('keydown', keydownHandler);
  }, [resetRound]);

  // ---------- render ----------
  return (
    <div style={{ width: '100%', border: '1px solid #222', borderRadius: 8 }}>
      <canvas ref={canvasReference} />
    </div>
  );
}
