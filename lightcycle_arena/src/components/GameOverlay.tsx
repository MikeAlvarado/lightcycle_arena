// src/components/GameOverlay.tsx
import { useEffect, useRef } from "react";
import type { CSSProperties, JSX, ReactNode } from "react";

import { HighScoresPanel } from "./HighScoresPanel";
import type { HighScoreEntry } from "../types/game";

export interface OverlayAction {
  label: string;
  onSelect: () => void;
  variant?: "primary" | "secondary";
  /** Short aside shown beside the label in the menu layout. */
  note?: string;
  /** Warm something up when the player hovers or tabs onto the button. */
  onPrefetch?: () => void;
}

interface GameOverlayProps {
  title: string;
  /** Replaces the heading, for the title screen's wordmark. */
  titleSlot?: ReactNode;
  variant?: "panel" | "title";
  /**
   * "crash" holds the card back for a beat and darkens the arena first, so the
   * wreck it is reporting is something you get to watch.
   */
  entrance?: "instant" | "crash";
  paragraph?: string;
  actions?: OverlayAction[];
  /** "menu" stacks the actions into a list you read down. */
  actionsLayout?: "row" | "menu";
  showLeaderboard?: boolean;
  leaderboardEntries?: HighScoreEntry[];
  maxRows?: number;
  extraContent?: ReactNode;
  /** Rendered after the actions, for anything the actions come before. */
  footer?: ReactNode;
  styleOverride?: CSSProperties;
}

/**
 * The card that covers the arena between rounds: title screen, verdict, pause
 * and game over all wear it.
 */
export function GameOverlay({
  title,
  titleSlot,
  variant = "panel",
  entrance = "instant",
  paragraph,
  actions = [],
  actionsLayout = "row",
  showLeaderboard = false,
  leaderboardEntries = [],
  maxRows = 5,
  extraContent,
  footer,
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

  const isMenu = actionsLayout === "menu";

  return (
    <div
      className={
        `canvas-overlay` +
        (variant === "title" ? " is-title" : "") +
        (entrance === "crash" ? " is-crash" : "")
      }
      style={styleOverride}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      ref={cardReference}
    >
      {titleSlot ?? <h2>{title}</h2>}

      {paragraph && <p>{paragraph}</p>}

      {extraContent}

      {actions.length > 0 && (
        <div className={`overlay-actions${isMenu ? " is-menu" : ""}`}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              className={action.variant === "secondary" ? "secondary" : undefined}
              // The name stays the label alone; the index and the aside are
              // decoration, and a screen reader shouldn't have to wade through
              // them to find the button it was looking for.
              aria-label={isMenu ? action.label : undefined}
              onClick={action.onSelect}
              onPointerEnter={action.onPrefetch}
              onFocus={action.onPrefetch}
            >
              {isMenu ? (
                <>
                  <span className="action-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="action-label">{action.label}</span>
                  {action.note && (
                    <span className="action-note" aria-hidden="true">
                      {action.note}
                    </span>
                  )}
                </>
              ) : (
                action.label
              )}
            </button>
          ))}
        </div>
      )}

      {footer}

      {showLeaderboard && leaderboardEntries.length > 0 && (
        <HighScoresPanel entries={leaderboardEntries} maxRows={maxRows} />
      )}
    </div>
  );
}
