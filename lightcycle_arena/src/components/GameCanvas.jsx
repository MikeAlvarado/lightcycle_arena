import React, { useRef, useEffect } from "react";
import { GRID_CONFIG } from "../utils/gridConfig";
import {
  createEmptyLattice,
  toLatticeVertexIndices,
  stepOnLattice,
  isInsideLattice,
  isOccupied,
  occupy,
  applyPendingDirection,
} from "../utils/latticeHelpers";
import { handleKeyDown as handleKeyDownBase } from "../utils/inputHandlers";
import { drawFrame } from "../utils/canvasDrawing";

/**
 * GameCanvas — Single Player using 2x Lattice
 * -------------------------------------------
 * - One boolean matrix (lattice) for both edges and vertices.
 * - Head moves between lattice vertices (even,even).
 * - Collision if the traversed edge OR the destination vertex is occupied.
 */
export function GameCanvas() {
  // Canvas & loop
  const canvasReference = useRef(null);
  const requestIdReference = useRef(0);
  const lastFrameTimestamp = useRef(0);
  const accumulatedMilliseconds = useRef(0);
  const logicStepMilliseconds = 100; // 10 updates per second
  const tickCounter = useRef(0);

  // Grid
  const grid = useRef({ columns: GRID_CONFIG.columns, rows: GRID_CONFIG.rows });

  // Lattice (2x) occupancy
  const lattice = useRef(createEmptyLattice(grid.current.rows, grid.current.columns));

  // Game state
  const gameIsRunning = useRef(true);
  const resultMessage = useRef("");

  // Player (head in lattice coords)
  const playerOne = useRef({
    name: "Player One",
    color: "#00e5ff",
    head: toLatticeVertexIndices({
      column: 5,
      row: Math.floor(grid.current.rows / 2),
    }), // {r,c} both even
    direction: "right",
    pendingDirection: "right",
  });

  // ---------- reset ----------
  function resetRound() {
    lattice.current = createEmptyLattice(grid.current.rows, grid.current.columns);
    playerOne.current.head = toLatticeVertexIndices({
      column: 5,
      row: Math.floor(grid.current.rows / 2),
    });
    playerOne.current.direction = "right";
    playerOne.current.pendingDirection = "right";

    gameIsRunning.current = true;
    resultMessage.current = "";
    tickCounter.current = 0;
  }

  // ---------- logic ----------
  function updateLogic() {
    if (!gameIsRunning.current) return;

    applyPendingDirection(playerOne);

    const fromVertex = playerOne.current.head; // lattice coords (even,even)
    const { edge, dest } = stepOnLattice(fromVertex, playerOne.current.direction);

    // Bounds
    if (!isInsideLattice(edge, grid.current) || !isInsideLattice(dest, grid.current)) {
      gameIsRunning.current = false;
      resultMessage.current = `${playerOne.current.name} hit the wall. Press 'R' to reset.`;
      return;
    }

    // Collision: traversed edge or destination vertex already occupied
    if (isOccupied(lattice.current, edge) || isOccupied(lattice.current, dest)) {
      gameIsRunning.current = false;
      resultMessage.current = `${playerOne.current.name} hit the trail. Press 'R' to reset.`;
      return;
    }

    // Leave a trail: mark current vertex and traversed edge
    occupy(lattice.current, fromVertex); // vertex you are leaving
    occupy(lattice.current, edge);       // edge you traversed

    // Advance head to destination vertex (do NOT occupy it yet)
    playerOne.current.head = dest;

    tickCounter.current += 1;
  }

  // ---------- Effect A: canvas, resize, RAF ----------
  useEffect(() => {
    const canvasElement = canvasReference.current;
    const context = canvasElement.getContext("2d");

    function resizeCanvasKeepingGridAspect() {
      const aspectRatio = grid.current.rows / grid.current.columns;
      const parent = canvasElement.parentElement;
      const targetWidth = Math.min(parent.clientWidth, 900);
      const targetHeight = Math.floor(targetWidth * aspectRatio);
      canvasElement.width = targetWidth;
      canvasElement.height = targetHeight;
    }

    function animationLoop(currentTimestamp) {
      if (!lastFrameTimestamp.current) lastFrameTimestamp.current = currentTimestamp;

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
        grid: grid.current,
        lattice: lattice.current,
        headLattice: playerOne.current.head,
        headColor: playerOne.current.color,
        tickCounter: tickCounter.current,
        running: gameIsRunning.current,
        message: resultMessage.current,
      });

      requestIdReference.current = requestAnimationFrame(animationLoop);
    }

    resizeCanvasKeepingGridAspect();
    window.addEventListener("resize", resizeCanvasKeepingGridAspect);
    requestIdReference.current = requestAnimationFrame(animationLoop);

    return () => {
      cancelAnimationFrame(requestIdReference.current);
      window.removeEventListener("resize", resizeCanvasKeepingGridAspect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Effect B: inputs ----------
  useEffect(() => {
    function keydownHandler(event) {
      handleKeyDownBase(event, playerOne, resetRound);
    }
    window.addEventListener("keydown", keydownHandler);
    return () => window.removeEventListener("keydown", keydownHandler);
  }, []);

  // ---------- render ----------
  return (
    <div style={{ width: "100%", border: "1px solid #222", borderRadius: 8 }}>
      <canvas ref={canvasReference} />
    </div>
  );
}
