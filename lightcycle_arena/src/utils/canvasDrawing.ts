// src/utils/canvasDrawing.ts

import type { GridConfig } from "./gridConfig";
import type { LatticeIndex, LatticeMatrix } from "./latticeHelpers";

/**
 * Draw the background and the crisp grid lines.
 */
export function drawGrid(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig
): void {
  context.fillStyle = "#0b0b0b";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  context.beginPath();

  // Vertical lines
  for (let columnIndex = 0; columnIndex <= grid.columns; columnIndex += 1) {
    const x = Math.floor(columnIndex * cellWidth) + 0.5;
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
  }

  // Horizontal lines
  for (let rowIndex = 0; rowIndex <= grid.rows; rowIndex += 1) {
    const y = Math.floor(rowIndex * cellHeight) + 0.5;
    context.moveTo(0, y);
    context.lineTo(canvasWidth, y);
  }

  context.lineWidth = 1;
  context.strokeStyle = "#1c1c1c";
  context.stroke();
}

/**
 * Draw trails using the 2x lattice (edges and vertices).
 * We paint where lattice[rowIndexInLattice][columnIndexInLattice] = true.
 * - Horizontal edges: even row,   odd column
 * - Vertical edges:   odd row,    even column
 * - Vertices:         even row,   even column (painted with same thickness)
 */
export function drawLatticeTrails(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig,
  lattice: LatticeMatrix
): void {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  const edgeThickness = 2; // px (you can make this configurable via HUD)

  // Horizontal edges (even row, odd column)
  for (let latticeRow = 0; latticeRow <= grid.rows * 2; latticeRow += 2) {
    for (let latticeColumn = 1; latticeColumn < grid.columns * 2; latticeColumn += 2) {
      if (!lattice[latticeRow][latticeColumn]) continue;

      const yCenter = Math.floor((latticeRow / 2) * cellHeight);
      const xLeft = Math.floor(((latticeColumn - 1) / 2) * cellWidth);

      context.fillStyle = "rgba(0,229,255,0.9)";
      context.fillRect(
        xLeft + 1,
        yCenter - Math.floor(edgeThickness / 2),
        Math.ceil(cellWidth) - 2,
        edgeThickness
      );
    }
  }

  // Vertical edges (odd row, even column)
  for (let latticeRow = 1; latticeRow < grid.rows * 2; latticeRow += 2) {
    for (let latticeColumn = 0; latticeColumn <= grid.columns * 2; latticeColumn += 2) {
      if (!lattice[latticeRow][latticeColumn]) continue;

      const xCenter = Math.floor((latticeColumn / 2) * cellWidth);
      const yTop = Math.floor(((latticeRow - 1) / 2) * cellHeight);

      context.fillStyle = "rgba(0,229,255,0.9)";
      context.fillRect(
        xCenter - Math.floor(edgeThickness / 2),
        yTop + 1,
        edgeThickness,
        Math.ceil(cellHeight) - 2
      );
    }
  }

  // Vertices (even, even) as same-thickness squares (to join segments cleanly)
  context.fillStyle = "rgba(0,229,255,0.9)";
  for (let latticeRow = 0; latticeRow <= grid.rows * 2; latticeRow += 2) {
    for (let latticeColumn = 0; latticeColumn <= grid.columns * 2; latticeColumn += 2) {
      if (!lattice[latticeRow][latticeColumn]) continue;

      const xCenter = Math.floor((latticeColumn / 2) * cellWidth);
      const yCenter = Math.floor((latticeRow / 2) * cellHeight);

      context.fillRect(
        xCenter - Math.floor(edgeThickness / 2),
        yCenter - Math.floor(edgeThickness / 2),
        edgeThickness,
        edgeThickness
      );
    }
  }
}

/**
 * Draw player head at the current lattice vertex (even, even).
 */
export function drawHeadAtLatticeVertex(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig,
  headLatticeIndex: LatticeIndex,
  color: string
): void {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;

  const xCenter = Math.floor((headLatticeIndex.columnIndexInLattice / 2) * cellWidth);
  const yCenter = Math.floor((headLatticeIndex.rowIndexInLattice / 2) * cellHeight);
  const size = Math.max(4, Math.floor(Math.min(cellWidth, cellHeight) * 0.25));

  context.fillStyle = color;
  context.fillRect(
    xCenter - Math.floor(size / 2),
    yCenter - Math.floor(size / 2),
    size,
    size
  );

  context.strokeStyle = "#000";
  context.lineWidth = 1;
  context.strokeRect(
    xCenter - Math.floor(size / 2) + 0.5,
    yCenter - Math.floor(size / 2) + 0.5,
    size - 1,
    size - 1
  );
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  grid: GridConfig,
  tickCounterValue: number,
  running: boolean,
  message: string
): void {
  context.fillStyle = "#9ecbff";
  context.font = "12px ui-monospace, Menlo, Consolas, monospace";
  context.fillText(`Grid: ${grid.columns} × ${grid.rows}`, 8, 16);
  context.fillText(`Tick: ${tickCounterValue}`, 8, 32);
  context.fillText(`Running: ${running ? "yes" : "no"}`, 8, 48);
  context.fillText(`Controls — Move: Arrows/WASD | Reset: R`, 8, 64);

  if (!running && message) {
    context.fillStyle = "#ffffff";
    context.font = "bold 18px ui-monospace, Menlo, Consolas, monospace";
    context.fillText(message, 8, 88);
  }
}

/**
 * Compose a full frame (grid → lattice trails → head → overlay).
 */
export function drawFrame(args: {
  context: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  grid: GridConfig;
  lattice: LatticeMatrix;
  headLatticeIndex: LatticeIndex;
  headColor: string;
  tickCounterValue: number;
  running: boolean;
  message: string;
}): void {
  const {
    context,
    canvasWidth,
    canvasHeight,
    grid,
    lattice,
    headLatticeIndex,
    headColor,
    tickCounterValue,
    running,
    message,
  } = args;

  drawGrid(context, canvasWidth, canvasHeight, grid);
  drawLatticeTrails(context, canvasWidth, canvasHeight, grid, lattice);
  drawHeadAtLatticeVertex(context, canvasWidth, canvasHeight, grid, headLatticeIndex, headColor);
  drawOverlay(context, grid, tickCounterValue, running, message);
}
