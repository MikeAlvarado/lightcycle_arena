import {
  cutButtonStyle,
  dPadFillWrapperStyle,
  dPadContainerStyle,
  buttonStyle,
  labelStyle,
  centerCellContainerStyle,
  resetButtonStyle,
  resetLabelStyle,
  turnButtonStyle,
  turnPadContainerStyle,
} from "../styles/dpadStyles";
import type { JSX } from "react";

import type { SteeringMode } from "../utils/steering";

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
  // (React 18 registers touchstart as passive, so preventDefault there is a
  // no-op that logs a console error; scrolling/zoom is blocked via CSS
  // touch-action on the buttons instead.)
  function bind(d: DPadDirection) {
    return { onPointerDown: () => onInput(d) };
  }
  function bindReset() {
    return { onPointerDown: () => onReset() };
  }

  const cutButton = onCut ? (
    <button
      style={{
        ...cutButtonStyle,
        borderColor: isCutting ? "#ffc23a" : "#3a3a3a",
        color: isCutting ? "#ffc23a" : "#f0f4ff",
      }}
      onPointerDown={onCut}
      aria-pressed={isCutting}
      aria-label="Cut the jet wall"
    >
      {isCutting ? "Wall off" : "Cut"}
    </button>
  ) : null;

  const resetButton = (
    <div style={centerCellContainerStyle}>
      <button style={resetButtonStyle} {...bindReset()} aria-label="Reset round">
        <span style={resetLabelStyle}>Reset</span>
      </button>
    </div>
  );

  if (steeringMode === "relative") {
    return (
      <div style={dPadFillWrapperStyle} aria-label="On-screen controls">
        {cutButton}
        <div style={turnPadContainerStyle}>
          <button style={turnButtonStyle} {...bind("left")} aria-label="Turn left">
            <span style={labelStyle}>↰</span>
          </button>

          {resetButton}

          <button style={turnButtonStyle} {...bind("right")} aria-label="Turn right">
            <span style={labelStyle}>↱</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={dPadFillWrapperStyle} aria-label="On-screen controls">
      {cutButton}
      <div style={dPadContainerStyle}>
        <div />
        <button style={buttonStyle} {...bind("up")} aria-label="Move up">
          <span style={labelStyle}>▲</span>
        </button>
        <div />

        <button style={buttonStyle} {...bind("left")} aria-label="Move left">
          <span style={labelStyle}>◀</span>
        </button>

        {resetButton}

        <button style={buttonStyle} {...bind("right")} aria-label="Move right">
          <span style={labelStyle}>▶</span>
        </button>

        <div />
        <button style={buttonStyle} {...bind("down")} aria-label="Move down">
          <span style={labelStyle}>▼</span>
        </button>
        <div />
      </div>
    </div>
  );
}
