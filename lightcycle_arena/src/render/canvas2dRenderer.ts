// src/render/canvas2dRenderer.ts
import type { GridConfig } from "../utils/gridConfig";
import type { GameRenderer, RenderFrame } from "./types";
import {
  drawControlsHint,
  drawGrid,
  drawHeadAtLatticeVertex,
  drawLatticeTrails,
} from "../utils/canvasDrawing";

/**
 * How the canvas picks its size:
 * - "fit-parent-aspect": grow inside the parent while keeping the grid aspect
 *   ratio (the classic full-arena view).
 * - "match-css-size": trust the size CSS already gave the element (used by the
 *   3D minimap, which is a fixed little box in the corner).
 */
export type Canvas2DSizing = "fit-parent-aspect" | "match-css-size";

export interface Canvas2DRendererOptions {
  sizing?: Canvas2DSizing;
}

/**
 * The original 2D arena view, behind the shared GameRenderer contract.
 * Drawing primitives still live in utils/canvasDrawing.
 */
export function createCanvas2DRenderer(
  canvas: HTMLCanvasElement,
  grid: GridConfig,
  options: Canvas2DRendererOptions = {}
): GameRenderer {
  const sizing: Canvas2DSizing = options.sizing ?? "fit-parent-aspect";
  const context = canvas.getContext("2d") as CanvasRenderingContext2D;

  function fitToParentKeepingAspect(): void {
    const parent = canvas.parentElement;
    if (!parent) return;

    const aspect = grid.rows / grid.columns;
    const availableWidth = parent.clientWidth;
    const availableHeight = parent.clientHeight;

    let targetWidth = Math.min(availableWidth, Math.floor(availableHeight / aspect));
    let targetHeight = Math.floor(targetWidth * aspect);

    targetWidth = Math.max(240, targetWidth);
    targetHeight = Math.max(180, targetHeight);

    // Render at device resolution but display at CSS size, otherwise the
    // canvas looks blurry on high-DPI (retina / mobile) screens.
    const devicePixelRatioValue = window.devicePixelRatio || 1;
    canvas.style.width = `${targetWidth}px`;
    canvas.style.height = `${targetHeight}px`;
    canvas.width = Math.floor(targetWidth * devicePixelRatioValue);
    canvas.height = Math.floor(targetHeight * devicePixelRatioValue);
  }

  function matchCssSize(): void {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    const devicePixelRatioValue = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * devicePixelRatioValue);
    canvas.height = Math.floor(cssHeight * devicePixelRatioValue);
  }

  function resize(): void {
    if (sizing === "match-css-size") matchCssSize();
    else fitToParentKeepingAspect();
  }

  function draw(frame: RenderFrame): void {
    // The backing store follows the device pixel ratio; draw in CSS pixels.
    const devicePixelRatioValue = window.devicePixelRatio || 1;
    context.setTransform(devicePixelRatioValue, 0, 0, devicePixelRatioValue, 0, 0);

    const drawWidth = canvas.width / devicePixelRatioValue;
    const drawHeight = canvas.height / devicePixelRatioValue;

    drawGrid(context, drawWidth, drawHeight, frame.grid);

    for (const player of frame.players) {
      drawLatticeTrails(
        context,
        drawWidth,
        drawHeight,
        frame.grid,
        player.trail,
        player.color
      );
    }

    for (const player of frame.players) {
      drawHeadAtLatticeVertex(
        context,
        drawWidth,
        drawHeight,
        frame.grid,
        player.headLatticeIndex,
        player.color,
        player.direction
      );
    }

    if (frame.controlsHint) drawControlsHint(context, frame.controlsHint);
  }

  return {
    resize,
    draw,
    resetRound(): void {
      // Nothing to keep between rounds: every frame is drawn from scratch.
    },
    dispose(): void {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
