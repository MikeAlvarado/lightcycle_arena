// src/render/trailGeometry.test.ts
import {
  MINIMUM_TRAIL_LENGTH,
  clipTipBehindBike,
  decideTrailAction,
  isOnRunAxis,
  spanBetween,
} from "./trailGeometry";
import type { TrailRunState } from "./trailGeometry";

const runEast: TrailRunState = { startX: 0, startZ: 4, direction: "right" };
const runNorth: TrailRunState = { startX: -2, startZ: 0, direction: "up" };

describe("decideTrailAction", () => {
  it("starts a run when there isn't one", () => {
    expect(decideTrailAction(null, 1, 2, "up")).toBe("start");
  });

  it("turns when the heading changed", () => {
    expect(decideTrailAction(runEast, 6, 4, "down")).toBe("turn");
  });

  it("extends while the corner stays on the run's axis", () => {
    expect(decideTrailAction(runEast, 6, 4, "right")).toBe("extend");
    expect(decideTrailAction(runNorth, -2, -6, "up")).toBe("extend");
  });

  it("asks for a rebuild when the corner drifted off the axis", () => {
    // Same heading but a different lane: a stalled frame swallowed a corner.
    expect(decideTrailAction(runEast, 6, 8, "right")).toBe("rebuild");
    expect(decideTrailAction(runNorth, 4, -6, "up")).toBe("rebuild");
  });
});

describe("isOnRunAxis", () => {
  it("tolerates floating point dust", () => {
    expect(isOnRunAxis(runEast, 10, 4 + 1e-9)).toBe(true);
    expect(isOnRunAxis(runEast, 10, 4.01)).toBe(false);
  });
});

describe("spanBetween", () => {
  it("centres a horizontal wall between its ends and keeps its lane", () => {
    const span = spanBetween(0, 4, 10, 4, "right");

    expect(span).toEqual({ centerX: 5, centerZ: 4, length: 10, horizontal: true });
  });

  it("centres a vertical wall between its ends", () => {
    const span = spanBetween(-2, 0, -2, -8, "up");

    expect(span).toEqual({ centerX: -2, centerZ: -4, length: 8, horizontal: false });
  });

  it("ignores drift on the off-axis coordinate", () => {
    // The lane comes from the start of the run, never from the moving tip.
    expect(spanBetween(0, 4, 10, 9, "right").centerZ).toBe(4);
  });

  it("never collapses a fresh wall to nothing", () => {
    expect(spanBetween(3, 3, 3, 3, "left").length).toBe(MINIMUM_TRAIL_LENGTH);
  });
});

describe("clipTipBehindBike", () => {
  it("leaves a gap behind the bike", () => {
    expect(clipTipBehindBike(runEast, 10, 4, 1)).toEqual({ x: 9, z: 4 });
  });

  it("clips along the run's own direction", () => {
    // Riding north means -Z, so the wall grows towards negative Z.
    expect(clipTipBehindBike(runNorth, -2, -10, 1)).toEqual({ x: -2, z: -9 });
  });

  it("never runs backwards past the start of the run", () => {
    expect(clipTipBehindBike(runEast, 0.2, 4, 1)).toEqual({ x: 0, z: 4 });
  });
});
