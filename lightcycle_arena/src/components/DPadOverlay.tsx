// src/components/DPadOverlay.tsx
import {
  dPadWrapperStyle,
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

/**
 * On-screen D-Pad overlay for mobile devices.
 * Occupies the lower half of the screen.
 */
export function DPadOverlay({ onInput, onReset }: DPadOverlayProps): JSX.Element {
  function emitDirection(direction: DPadDirection) {
    onInput(direction);
  }

  function createTouchBindings(direction: DPadDirection) {
    return {
      onTouchStart: (event: React.TouchEvent) => {
        event.preventDefault();
        emitDirection(direction);
      },
      onClick: (event: React.MouseEvent) => {
        event.preventDefault();
        emitDirection(direction);
      },
    };
  }

  function createResetBindings() {
    return {
      onTouchStart: (event: React.TouchEvent) => {
        event.preventDefault();
        onReset();
      },
      onClick: (event: React.MouseEvent) => {
        event.preventDefault();
        onReset();
      },
    };
  }

return (
    <div style={dPadWrapperStyle} aria-label="On-screen controls">
      <div style={dPadContainerStyle}>
        {/* Row 1 */}
        <div />
        <button style={buttonStyle} {...createTouchBindings("up")} aria-label="Move up">
          <span style={labelStyle}>▲</span>
        </button>
        <div />

        {/* Row 2 */}
        <button style={buttonStyle} {...createTouchBindings("left")} aria-label="Move left">
          <span style={labelStyle}>◀</span>
        </button>

        {/* Center reset button */}
        <div style={centerCellContainerStyle}>
          <button
            style={resetButtonStyle}
            {...createResetBindings()}
            aria-label="Reset"
            title='Reset'
          >
            <span style={resetLabelStyle}></span>
          </button>
        </div>

        <button style={buttonStyle} {...createTouchBindings("right")} aria-label="Move right">
          <span style={labelStyle}>▶</span>
        </button>

        {/* Row 3 */}
        <div />
        <button style={buttonStyle} {...createTouchBindings("down")} aria-label="Move down">
          <span style={labelStyle}>▼</span>
        </button>
        <div />
      </div>
    </div>
  );
}
