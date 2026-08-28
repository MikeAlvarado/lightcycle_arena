// src/utils/inputHandlers.ts
import type { RefObject } from "react";

import type { PlayerForInput } from "../types/player";
import type { SteerIntent, SteeringMode } from "./steering";
import { resolveSteering } from "./steering";

/** Maps a keyboard key to the direction the player asked for, if any. */
function intentForKey(key: string): SteerIntent | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}

export function handleKeyDown(
  event: KeyboardEvent,
  playerRef: RefObject<PlayerForInput>,
  resetRound: () => void,
  steeringMode: SteeringMode = "absolute"
): void {
  const key = event.key; // e.g., "ArrowUp", "w", "W", "r"
  let handled = false;

  const intent = intentForKey(key);
  if (intent) {
    playerRef.current.pendingDirection = resolveSteering(
      intent,
      playerRef.current.direction,
      steeringMode
    );
    handled = true;
  } else if (key === "r" || key === "R") {
    resetRound();
    handled = true;
  }

  // Prevent the browser from scrolling the page when we handled the key
  if (handled) {
    event.preventDefault();
  }
}
