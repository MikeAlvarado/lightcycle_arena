// src/components/GameOverlay.tsx
import { HighScoresPanel } from "./HighScoresPanel";
import type { HighScoreEntry } from "../types/game";

interface GameOverlayProps {
  title: string;
  paragraph?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  showLeaderboard?: boolean;
  leaderboardEntries?: HighScoreEntry[];
  maxRows?: number;
  extraContent?: React.ReactNode;
  styleOverride?: React.CSSProperties;
}

/**
 * Reusable overlay that renders a centered card with title, paragraph, up to two
 * action buttons and optionally a leaderboard.
 */
export function GameOverlay({
  title,
  paragraph,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  showLeaderboard = false,
  leaderboardEntries = [],
  maxRows = 5,
  extraContent,
  styleOverride,
}: GameOverlayProps): JSX.Element {
  return (
    <div
      className="canvas-overlay"
      style={styleOverride}
      role="dialog"
      aria-modal="true"
    >
      <h2>{title}</h2>

      {paragraph && <p>{paragraph}</p>}

      {extraContent}

      <div className="overlay-actions">
        {primaryLabel && onPrimary && (
          <button onClick={onPrimary}>{primaryLabel}</button>
        )}

        {secondaryLabel && onSecondary && (
          <button className="secondary" onClick={onSecondary}>
            {secondaryLabel}
          </button>
        )}
      </div>

      {showLeaderboard && leaderboardEntries.length > 0 && (
        <HighScoresPanel entries={leaderboardEntries} maxRows={maxRows} />
      )}
    </div>
  );
}
