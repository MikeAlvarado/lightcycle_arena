// src/utils/steering.test.ts
import { resolveSteering } from "./steering";
import { turnLeft, turnRight } from "./latticeHelpers";
import type { Direction } from "./latticeHelpers";

const ALL_DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

describe("quarter turns", () => {
  it("turns left through the compass in order", () => {
    expect(turnLeft("up")).toBe("left");
    expect(turnLeft("left")).toBe("down");
    expect(turnLeft("down")).toBe("right");
    expect(turnLeft("right")).toBe("up");
  });

  it("turns right the other way", () => {
    expect(turnRight("up")).toBe("right");
    expect(turnRight("right")).toBe("down");
    expect(turnRight("down")).toBe("left");
    expect(turnRight("left")).toBe("up");
  });

  it.each(ALL_DIRECTIONS)("undoes a left turn with a right turn from %s", (direction) => {
    expect(turnRight(turnLeft(direction))).toBe(direction);
  });

  it.each(ALL_DIRECTIONS)("never turns 180 degrees in one step from %s", (direction) => {
    // A quarter turn must stay perpendicular; the opposite heading would be an
    // instant crash into the player's own wall.
    const isVertical = (d: Direction) => d === "up" || d === "down";
    expect(isVertical(turnLeft(direction))).not.toBe(isVertical(direction));
    expect(isVertical(turnRight(direction))).not.toBe(isVertical(direction));
  });
});

describe("resolveSteering in absolute mode", () => {
  it.each(ALL_DIRECTIONS)("passes %s straight through as a heading", (intent) => {
    for (const heading of ALL_DIRECTIONS) {
      expect(resolveSteering(intent, heading, "absolute")).toBe(intent);
    }
  });
});

describe("resolveSteering in relative mode", () => {
  it("reads left and right from the saddle, not from the board", () => {
    // Riding south, screen-right is the board's west: the bug this fixes.
    expect(resolveSteering("right", "down", "relative")).toBe("left");
    expect(resolveSteering("left", "down", "relative")).toBe("right");
    expect(resolveSteering("right", "up", "relative")).toBe("right");
    expect(resolveSteering("left", "up", "relative")).toBe("left");
    expect(resolveSteering("right", "left", "relative")).toBe("up");
    expect(resolveSteering("right", "right", "relative")).toBe("down");
  });

  it.each(ALL_DIRECTIONS)("keeps the heading on forward and reverse from %s", (heading) => {
    expect(resolveSteering("up", heading, "relative")).toBe(heading);
    expect(resolveSteering("down", heading, "relative")).toBe(heading);
  });

  it.each(ALL_DIRECTIONS)("never resolves into a U-turn from %s", (heading) => {
    const opposite: Record<Direction, Direction> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    };
    for (const intent of ALL_DIRECTIONS) {
      expect(resolveSteering(intent, heading, "relative")).not.toBe(opposite[heading]);
    }
  });

  it("chains turns from the applied heading, so two rights make a U-turn over two ticks", () => {
    const afterFirst = resolveSteering("right", "up", "relative");
    expect(afterFirst).toBe("right");
    expect(resolveSteering("right", afterFirst, "relative")).toBe("down");
  });
});
