// src/utils/canvasDrawing.ts

import type { GridConfig } from "./gridConfig";
import type { Direction, LatticeIndex, LatticeMatrix } from "./latticeHelpers";

/** Arena palette: deep blue-black floor, cold neon lines. */
const ARENA_BACKGROUND = "#04060d";
const ARENA_GLOW_CENTER = "rgba(24, 70, 150, 0.32)";
const GRID_MINOR_COLOR = "rgba(47, 107, 255, 0.22)";
const GRID_MAJOR_COLOR = "rgba(90, 175, 255, 0.5)";
const ARENA_BORDER_COLOR = "#00d8ff";
const TRAIL_CORE_COLOR = "rgba(255, 255, 255, 0.8)";

/** A brighter line every few cells keeps the floor readable without noise. */
const MAJOR_LINE_EVERY = 5;

/**
 * Line weights are authored for a full-size board and scaled down for small
 * surfaces, so the same drawing code also renders the 3D view's minimap
 * without turning it into a smear of glow.
 */
function strokeScale(cellWidth: number): number {
  return Math.min(1.4, Math.max(0.32, cellWidth / 18));
}

/**
 * Draw the arena floor: dark ground, a soft central glow, the grid itself and
 * a lit border marking the walls you can crash into.
 */
export function drawGrid(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig
): void {
  context.fillStyle = ARENA_BACKGROUND;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const centerGlow = context.createRadialGradient(
    canvasWidth / 2,
    canvasHeight / 2,
    0,
    canvasWidth / 2,
    canvasHeight / 2,
    Math.max(canvasWidth, canvasHeight) * 0.72
  );
  centerGlow.addColorStop(0, ARENA_GLOW_CENTER);
  centerGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = centerGlow;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;
  const scale = strokeScale(cellWidth);

  const minorLines = new Path2D();
  const majorLines = new Path2D();

  for (let columnIndex = 0; columnIndex <= grid.columns; columnIndex += 1) {
    const x = Math.floor(columnIndex * cellWidth) + 0.5;
    const path = columnIndex % MAJOR_LINE_EVERY === 0 ? majorLines : minorLines;
    path.moveTo(x, 0);
    path.lineTo(x, canvasHeight);
  }

  for (let rowIndex = 0; rowIndex <= grid.rows; rowIndex += 1) {
    const y = Math.floor(rowIndex * cellHeight) + 0.5;
    const path = rowIndex % MAJOR_LINE_EVERY === 0 ? majorLines : minorLines;
    path.moveTo(0, y);
    path.lineTo(canvasWidth, y);
  }

  context.lineWidth = Math.max(0.5, scale);
  context.strokeStyle = GRID_MINOR_COLOR;
  context.stroke(minorLines);

  context.lineWidth = Math.max(0.6, scale * 1.15);
  context.strokeStyle = GRID_MAJOR_COLOR;
  context.stroke(majorLines);

  context.save();
  context.shadowColor = ARENA_BORDER_COLOR;
  context.shadowBlur = 12 * scale;
  context.strokeStyle = ARENA_BORDER_COLOR;
  context.lineWidth = Math.max(1, 2 * scale);
  context.strokeRect(1, 1, canvasWidth - 2, canvasHeight - 2);
  context.restore();
}

/**
 * Draw one player's light wall.
 *
 * The lattice is a 2x matrix:
 * - Horizontal edges: even row, odd column
 * - Vertical edges:   odd row,  even column
 *
 * Every edge goes into a single path stroked twice — a wide glowing pass and a
 * thin white core. Two draw calls per player instead of one per cell, which is
 * what makes the glow affordable at 60 fps.
 */
export function drawLatticeTrails(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig,
  lattice: LatticeMatrix,
  trailColor: string
): void {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;
  const scale = strokeScale(cellWidth);

  const trailPath = new Path2D();
  let hasAnySegment = false;

  // Horizontal edges (even row, odd column)
  for (let latticeRow = 0; latticeRow <= grid.rows * 2; latticeRow += 2) {
    for (let latticeColumn = 1; latticeColumn < grid.columns * 2; latticeColumn += 2) {
      if (!lattice[latticeRow][latticeColumn]) continue;

      const y = (latticeRow / 2) * cellHeight;
      trailPath.moveTo(((latticeColumn - 1) / 2) * cellWidth, y);
      trailPath.lineTo(((latticeColumn + 1) / 2) * cellWidth, y);
      hasAnySegment = true;
    }
  }

  // Vertical edges (odd row, even column)
  for (let latticeRow = 1; latticeRow < grid.rows * 2; latticeRow += 2) {
    for (let latticeColumn = 0; latticeColumn <= grid.columns * 2; latticeColumn += 2) {
      if (!lattice[latticeRow][latticeColumn]) continue;

      const x = (latticeColumn / 2) * cellWidth;
      trailPath.moveTo(x, ((latticeRow - 1) / 2) * cellHeight);
      trailPath.lineTo(x, ((latticeRow + 1) / 2) * cellHeight);
      hasAnySegment = true;
    }
  }

  if (!hasAnySegment) return;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  context.shadowColor = trailColor;
  context.shadowBlur = 10 * scale;
  context.strokeStyle = trailColor;
  context.lineWidth = Math.max(1.4, 3.2 * scale);
  context.stroke(trailPath);

  context.shadowBlur = 0;
  context.strokeStyle = TRAIL_CORE_COLOR;
  context.lineWidth = Math.max(0.5, 1.1 * scale);
  context.stroke(trailPath);
  context.restore();
}

/** Rotation that points a shape drawn facing up along the given direction. */
function headingAngle(direction: Direction): number {
  switch (direction) {
    case "up":
      return 0;
    case "right":
      return Math.PI / 2;
    case "down":
      return Math.PI;
    case "left":
    default:
      return -Math.PI / 2;
  }
}

/**
 * Draw a player's cycle as a glowing arrowhead at its lattice vertex, so the
 * flat view shows which way it is pointing at a glance.
 */
export function drawHeadAtLatticeVertex(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  grid: GridConfig,
  headLatticeIndex: LatticeIndex,
  color: string,
  direction: Direction
): void {
  const cellWidth = canvasWidth / grid.columns;
  const cellHeight = canvasHeight / grid.rows;
  const scale = strokeScale(cellWidth);

  const xCenter = (headLatticeIndex.columnIndexInLattice / 2) * cellWidth;
  const yCenter = (headLatticeIndex.rowIndexInLattice / 2) * cellHeight;
  const radius = Math.max(2.5, Math.min(cellWidth, cellHeight) * 0.46);

  context.save();
  context.translate(xCenter, yCenter);
  context.rotate(headingAngle(direction));

  const arrowhead = new Path2D();
  arrowhead.moveTo(0, -radius);
  arrowhead.lineTo(radius * 0.78, radius * 0.62);
  arrowhead.lineTo(0, radius * 0.28);
  arrowhead.lineTo(-radius * 0.78, radius * 0.62);
  arrowhead.closePath();

  context.shadowColor = color;
  context.shadowBlur = 14 * scale;
  context.fillStyle = color;
  context.fill(arrowhead);

  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(0, -radius * 0.1, Math.max(0.8, radius * 0.24), 0, Math.PI * 2);
  context.fill();
  context.restore();
}
