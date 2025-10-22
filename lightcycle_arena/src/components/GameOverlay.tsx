// src/components/GameOverlay.tsx
import { HighScoresPanel } from "./HighScoresPanel";
import type { HighScoreEntry } from "../types/game";

interface GameOverlayProps {
  title: string;
  paragraph?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  showLeaderboard?: boolean;
  leaderboardEntries?: HighScoreEntry[];
  maxRows?: number;
  extraContent?: React.ReactNode;
  styleOverride?: React.CSSProperties;
}

/**
 * Reusable overlay that renders a centered card with title, paragraph, primary button
 * and optionally a leaderboard.
 */
export function GameOverlay({
  title,
  paragraph,
  primaryLabel,
  onPrimary,
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

      {primaryLabel && onPrimary && (
        <button onClick={onPrimary}>{primaryLabel}</button>
      )}

      {showLeaderboard && leaderboardEntries.length > 0 && (
        <HighScoresPanel entries={leaderboardEntries} maxRows={maxRows} />
      )}
    </div>
  );
}
