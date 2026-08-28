// src/utils/inputHandlers.ts
import type { RefObject } from "react";

import type { PlayerForInput } from "../types/player";
import type { SteerIntent, SteeringMode } from "./steering";
import { resolveSteering } from "./steering";

/** Which half of the keyboard drives a rider. */
export type KeyScheme = "arrows" | "wasd" | "both";

export interface KeyboardControls {
  playerRef: RefObject<PlayerForInput>;
  scheme: KeyScheme;
  steeringMode: SteeringMode;
}

const ARROW_INTENTS: Record<string, SteerIntent> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const LETTER_INTENTS: Record<string, SteerIntent> = {
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

/** Maps a key to the direction one rider asked for, if that key is theirs. */
export function intentForKey(key: string, scheme: KeyScheme): SteerIntent | null {
  if (scheme !== "wasd" && key in ARROW_INTENTS) return ARROW_INTENTS[key];
  if (scheme !== "arrows") {
    const letter = LETTER_INTENTS[key.toLowerCase()];
    if (letter) return letter;
  }
  return null;
}

/**
 * Route one key press to whichever riders it belongs to.
 *
 * Taking a list of controls is what lets two people share a keyboard: player
 * one on the arrows, player two on WASD, each with their own steering mode.
 */
export function handleKeyDown(
  event: KeyboardEvent,
  controls: KeyboardControls[],
  onReset: () => void,
  onTogglePause?: () => void
): void {
  let handled = false;

  for (const control of controls) {
    const intent = intentForKey(event.key, control.scheme);
    if (!intent) continue;

    control.playerRef.current.pendingDirection = resolveSteering(
      intent,
      control.playerRef.current.direction,
      control.steeringMode
    );
    handled = true;
  }

  if (!handled) {
    switch (event.key) {
      case "r":
      case "R":
        onReset();
        handled = true;
        break;
      case "p":
      case "P":
        onTogglePause?.();
        handled = true;
        break;
      default:
        break;
    }
  }

  // Prevent the browser from scrolling the page when we handled the key
  if (handled) {
    event.preventDefault();
  }
}
