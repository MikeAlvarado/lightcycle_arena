// src/utils/inputHandlers.ts

import type { Direction } from "./latticeHelpers";

/** Minimal player shape needed for input handling. */
export interface PlayerForInput {
  pendingDirection: Direction;
}

export type ResetRoundFunction = () => void;

/**
 * Keyboard handler for a single player.
 * 'R' resets the round.
 */
export function handleKeyDown(
  event: KeyboardEvent,
  playerRef: React.MutableRefObject<PlayerForInput>,
  resetRound: ResetRoundFunction
): void {
  const key = event.key.toLowerCase();

  if (key === "r") {
    resetRound();
    return;
  }

  // Arrow keys and WASD aliases
  if (key === "arrowup" || key === "w") playerRef.current.pendingDirection = "up";
  if (key === "arrowdown" || key === "s") playerRef.current.pendingDirection = "down";
  if (key === "arrowleft" || key === "a") playerRef.current.pendingDirection = "left";
  if (key === "arrowright" || key === "d") playerRef.current.pendingDirection = "right";
}
