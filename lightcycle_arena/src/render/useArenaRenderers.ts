// src/render/useArenaRenderers.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { RenderMode } from "../types/game";
import { GRID_CONFIG } from "../utils/gridConfig";
import { createCanvas2DRenderer } from "./canvas2dRenderer";
import { loadThreeRenderer } from "./loadThreeRenderer";
import type { GameRenderer, RenderFrame } from "./types";

/** At most this much elapsed time is replayed in one frame (3 logic ticks). */
const MAXIMUM_CATCH_UP_MILLISECONDS = 300;

export interface ArenaRenderersOptions {
  renderMode: RenderMode;
  glowEnabled: boolean;
  /** Length of one logic tick at the current level. */
  stepMilliseconds: number;
  /** Whether the arena should be advancing at all. */
  isRunning: boolean;
  advanceOneTick: () => void;
  buildFrame: (interpolationAlpha: number) => RenderFrame;
  /** Called when the cockpit can't be shown, so the caller can fall back. */
  onWebglUnavailable: () => void;
}

export interface ArenaRenderers {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  minimapCanvasRef: RefObject<HTMLCanvasElement | null>;
  /**
   * Identity of the canvas element. A canvas that has handed out a 2D context
   * can never give a WebGL one, and a lost context takes its buffers with it,
   * so both cases need a brand new element.
   */
  canvasKey: string;
  /** Drop whatever the renderers accumulated during the previous round. */
  resetRound: () => void;
}

/**
 * Owns the canvases, the two renderers and the single animation loop.
 *
 * The loop is started once and never restarted: it reads the newest callbacks
 * through a ref, so a level change or a pause doesn't tear down and rebuild the
 * timing state underneath it.
 */
export function useArenaRenderers(options: ArenaRenderersOptions): ArenaRenderers {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapRendererRef = useRef<GameRenderer | null>(null);

  /** Bumped to rebuild the scene after the GPU hands a context back. */
  const [generation, setGeneration] = useState<number>(0);

  const latestOptions = useRef(options);
  useEffect(() => {
    latestOptions.current = options;
  });

  const { renderMode, glowEnabled } = options;

  // Main renderer. Rebuilt only when the view, the effect settings or the GPU
  // context change — never for a level or a pause.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (renderMode !== "3d") {
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
          onContextRestored: () => setGeneration((count) => count + 1),
        });
        rendererRef.current = renderer;
        renderer.resize();
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        // Either the chunk failed to load or there is no WebGL context to be
        // had (old device, blocked GPU). The caller falls back to the flat
        // board rather than leaving the player staring at nothing.
        console.warn("3D view unavailable, falling back to the flat board:", error);
        latestOptions.current.onWebglUnavailable();
      });

    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [renderMode, glowEnabled, generation]);

  // Minimap: the 2D board reused at postage-stamp size, so the cockpit view
  // doesn't cost the player all arena awareness.
  useEffect(() => {
    const minimapCanvas = minimapCanvasRef.current;
    if (renderMode !== "3d" || !minimapCanvas) return;

    const minimapRenderer = createCanvas2DRenderer(minimapCanvas, GRID_CONFIG, {
      sizing: "match-css-size",
    });
    minimapRendererRef.current = minimapRenderer;
    minimapRenderer.resize();

    return () => {
      minimapRenderer.dispose();
      minimapRendererRef.current = null;
    };
  }, [renderMode]);

  // The loop, started once for the life of the component.
  useEffect(() => {
    let frameRequestId = 0;
    let lastTimestamp = 0;
    let accumulatedMilliseconds = 0;

    function animationLoop(currentTimestamp: number): void {
      const current = latestOptions.current;

      if (!lastTimestamp) lastTimestamp = currentTimestamp;
      // requestAnimationFrame stops in a hidden tab, so the first frame back
      // carries the whole pause. Without this cap the catch-up loop would run
      // hundreds of ticks at once and crash the player before anything is drawn.
      const elapsed = Math.min(
        MAXIMUM_CATCH_UP_MILLISECONDS,
        currentTimestamp - lastTimestamp
      );
      lastTimestamp = currentTimestamp;

      if (current.isRunning) {
        accumulatedMilliseconds += elapsed;
        while (accumulatedMilliseconds >= current.stepMilliseconds) {
          current.advanceOneTick();
          accumulatedMilliseconds -= current.stepMilliseconds;
        }
      } else {
        // Nothing is moving, so nothing is owed: a pause can't be replayed as
        // game time once it ends.
        accumulatedMilliseconds = 0;
      }

      // Between ticks nothing moves, so freeze the heads on their vertex.
      const interpolationAlpha = current.isRunning
        ? Math.min(1, accumulatedMilliseconds / current.stepMilliseconds)
        : 1;

      const frame = current.buildFrame(interpolationAlpha);
      rendererRef.current?.draw(frame);
      minimapRendererRef.current?.draw(frame);

      frameRequestId = requestAnimationFrame(animationLoop);
    }

    frameRequestId = requestAnimationFrame(animationLoop);
    return () => cancelAnimationFrame(frameRequestId);
  }, []);

  /*
   * The arena is sized by its container, not by the window: the HUD appearing
   * when a run starts resizes the zone without the window moving an inch.
   * Watching the element covers both, and window resizes come through it too.
   */
  useEffect(() => {
    function handleResize(): void {
      rendererRef.current?.resize();
      minimapRendererRef.current?.resize();
    }

    handleResize();

    const zone = canvasRef.current?.parentElement;
    if (!zone || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }

    const observer = new ResizeObserver(handleResize);
    observer.observe(zone);
    return () => observer.disconnect();
  }, [renderMode, generation]);

  const resetRound = useCallback((): void => {
    rendererRef.current?.resetRound();
    minimapRendererRef.current?.resetRound();
  }, []);

  return {
    canvasRef,
    minimapCanvasRef,
    canvasKey: `${renderMode}-${generation}`,
    resetRound,
  };
}
