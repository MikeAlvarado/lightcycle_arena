import type { JSX } from "react";

import type { SteeringMode } from "../utils/steering";
import "../styles/controls.css";

export type DPadDirection = "up" | "down" | "left" | "right";

interface DPadOverlayProps {
  onInput: (direction: DPadDirection) => void;
  onReset: () => void;
  /** Relative steering only needs two keys, so it gets its own layout. */
  steeringMode?: SteeringMode;
  /** Only passed when the jet wall rule is being played. */
  onCut?: () => void;
  isCutting?: boolean;
}

export function DPadOverlay({
  onInput,
  onReset,
  steeringMode = "absolute",
  onCut,
  isCutting = false,
}: DPadOverlayProps): JSX.Element {
  // pointerdown fires once for both touch and mouse, with no click delay.
  // (React registers touchstart as passive, so preventDefault there is a no-op
  // that logs a console error; scrolling and zoom are blocked with CSS
  // touch-action on the buttons instead.)
  function bind(direction: DPadDirection) {
    return { onPointerDown: () => onInput(direction) };
  }

  const resetButton = (
    <button
      type="button"
      className="control-reset"
      onPointerDown={onReset}
      aria-label="Reset round"
    >
      Reset
    </button>
  );

  const cutButton = onCut ? (
    <button
      type="button"
      className={`control-cut${isCutting ? " is-cutting" : ""}`}
      onPointerDown={onCut}
      aria-pressed={isCutting}
      aria-label="Cut the jet wall"
    >
      {isCutting ? "Wall off" : "Cut"}
    </button>
  ) : null;

  if (steeringMode === "relative") {
    return (
      <div className="control-pad is-turns" aria-label="On-screen controls">
        {resetButton}

        <button
          type="button"
          className="control-key is-turn"
          {...bind("left")}
          aria-label="Turn left"
        >
          ↰
        </button>

        {cutButton}

        <button
          type="button"
          className="control-key is-turn"
          {...bind("right")}
          aria-label="Turn right"
        >
          ↱
        </button>
      </div>
    );
  }

  return (
    <div className="control-pad is-compass" aria-label="On-screen controls">
      {resetButton}

      <div className="control-cross">
        <button
          type="button"
          className="control-key control-key-up"
          {...bind("up")}
          aria-label="Move up"
        >
          ▲
        </button>
        <button
          type="button"
          className="control-key control-key-left"
          {...bind("left")}
          aria-label="Move left"
        >
          ◀
        </button>
        <button
          type="button"
          className="control-key control-key-right"
          {...bind("right")}
          aria-label="Move right"
        >
          ▶
        </button>
        <button
          type="button"
          className="control-key control-key-down"
          {...bind("down")}
          aria-label="Move down"
        >
          ▼
        </button>
      </div>

      {cutButton}
    </div>
  );
}
