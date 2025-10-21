// src/utils/inputHandlers.ts
import type { PlayerForInput } from "../types/player";

export function handleKeyDown(
  event: KeyboardEvent,
  playerRef: React.MutableRefObject<PlayerForInput>,
  resetRound: () => void
): void {
  const key = event.key; // e.g., "ArrowUp", "w", "W", "r"
  let handled = false;

  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      playerRef.current.pendingDirection = "up";
      handled = true;
      break;

    case "ArrowDown":
    case "s":
    case "S":
      playerRef.current.pendingDirection = "down";
      handled = true;
      break;

    case "ArrowLeft":
    case "a":
    case "A":
      playerRef.current.pendingDirection = "left";
      handled = true;
      break;

    case "ArrowRight":
    case "d":
    case "D":
      playerRef.current.pendingDirection = "right";
      handled = true;
      break;

    case "r":
    case "R":
      resetRound();
      handled = true;
      break;

    default:
      handled = false;
  }

  // Prevent the browser from scrolling the page when we handled the key
  if (handled) {
    event.preventDefault();
  }
}
