// src/utils/steering.ts
import type { Direction } from "./latticeHelpers";
import { turnLeft, turnRight } from "./latticeHelpers";

/**
 * How a direction press is read.
 * - "absolute": the key is a compass heading. Right in the flat board view is
 *   the right edge of the screen, which is exactly what you see up there.
 * - "relative": the key is a turn. Behind the bike, "right" has to mean the
 *   bike's right, otherwise steering inverts every time you ride south.
 */
export type SteeringMode = "absolute" | "relative";

/** What the player asked for, before it is resolved against the heading. */
export type SteerIntent = Direction;

/**
 * Resolve a press into an absolute heading.
 *
 * Relative turns resolve against the *applied* direction, not the buffered one,
 * so two presses inside a single 100 ms tick can't stack into a U-turn that the
 * game would then reject, leaving the bike going straight.
 */
export function resolveSteering(
  intent: SteerIntent,
  appliedDirection: Direction,
  mode: SteeringMode
): Direction {
  if (mode === "absolute") return intent;

  switch (intent) {
    case "left":
      return turnLeft(appliedDirection);
    case "right":
      return turnRight(appliedDirection);
    // Forward keeps the current heading and reverse is a crash into your own
    // wall, so both mean "carry on" from the saddle.
    default:
      return appliedDirection;
  }
}
