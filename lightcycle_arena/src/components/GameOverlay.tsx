// src/components/GameOverlay.tsx
import { useEffect, useRef } from "react";
import type { CSSProperties, JSX, ReactNode } from "react";

import { HighScoresPanel } from "./HighScoresPanel";
import type { HighScoreEntry } from "../types/game";

export interface OverlayAction {
  label: string;
  onSelect: () => void;
  variant?: "primary" | "secondary";
  /** Warm something up when the player hovers or tabs onto the button. */
  onPrefetch?: () => void;
}

interface GameOverlayProps {
  title: string;
  paragraph?: string;
  actions?: OverlayAction[];
  showLeaderboard?: boolean;
  leaderboardEntries?: HighScoreEntry[];
  maxRows?: number;
  extraContent?: ReactNode;
  styleOverride?: CSSProperties;
}

/**
 * Reusable overlay that renders a centered card with title, paragraph, any
 * number of actions and optionally a leaderboard.
 */
export function GameOverlay({
  title,
  paragraph,
  actions = [],
  showLeaderboard = false,
  leaderboardEntries = [],
  maxRows = 5,
  extraContent,
  styleOverride,
}: GameOverlayProps): JSX.Element {
  const cardReference = useRef<HTMLDivElement | null>(null);

  // Move focus into the dialog when it opens so the keyboard can drive it: the
  // name field if the player is being asked for one, the first action if not.
  useEffect(() => {
    const card = cardReference.current;
    if (!card) return;
    if (card.contains(document.activeElement)) return;

    const target =
      card.querySelector<HTMLInputElement>("input") ??
      card.querySelector<HTMLButtonElement>("button");
    target?.focus();
  }, [title]);

  return (
    <div
      className="canvas-overlay"
      style={styleOverride}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={cardReference}
    >
      <h2>{title}</h2>

      {paragraph && <p>{paragraph}</p>}

      {extraContent}

      {actions.length > 0 && (
        <div className="overlay-actions">
          {actions.map((action) => (
            <button
              key={action.label}
              className={action.variant === "secondary" ? "secondary" : undefined}
              onClick={action.onSelect}
              onPointerEnter={action.onPrefetch}
              onFocus={action.onPrefetch}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {showLeaderboard && leaderboardEntries.length > 0 && (
        <HighScoresPanel entries={leaderboardEntries} maxRows={maxRows} />
      )}
    </div>
  );
}
