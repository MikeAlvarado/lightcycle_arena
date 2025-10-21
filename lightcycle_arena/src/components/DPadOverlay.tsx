import {
  dPadFillWrapperStyle,
  dPadContainerStyle,
  buttonStyle,
  labelStyle,
  centerCellContainerStyle,
  resetButtonStyle,
  resetLabelStyle,
} from "../styles/dpadStyles";

export type DPadDirection = "up" | "down" | "left" | "right";

interface DPadOverlayProps {
  onInput: (direction: DPadDirection) => void;
  onReset: () => void;
}

export function DPadOverlay({ onInput, onReset }: DPadOverlayProps): JSX.Element {
  function emit(d: DPadDirection) { onInput(d); }
  function bind(d: DPadDirection) {
    return {
      onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); emit(d); },
      onClick: (e: React.MouseEvent) => { e.preventDefault(); emit(d); },
    };
  }
  function bindReset() {
    return {
      onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); onReset(); },
      onClick: (e: React.MouseEvent) => { e.preventDefault(); onReset(); },
    };
  }

  return (
    <div style={dPadFillWrapperStyle} aria-label="On-screen controls">
      <div style={dPadContainerStyle}>
        <div />
        <button style={buttonStyle} {...bind("up")} aria-label="Move up">
          <span style={labelStyle}>▲</span>
        </button>
        <div />

        <button style={buttonStyle} {...bind("left")} aria-label="Move left">
          <span style={labelStyle}>◀</span>
        </button>

        <div style={centerCellContainerStyle}>
          <button style={resetButtonStyle} {...bindReset()} aria-label="Reset round">
            <span style={resetLabelStyle}>Reset</span>
          </button>
        </div>

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
