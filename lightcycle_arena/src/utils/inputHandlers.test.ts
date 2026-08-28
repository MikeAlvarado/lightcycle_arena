// src/utils/inputHandlers.test.ts
import { handleKeyDown } from "./inputHandlers";
import type { PlayerForInput } from "../types/player";
import type { Direction } from "./latticeHelpers";

function makePlayerRef(direction: Direction) {
  return {
    current: { direction, pendingDirection: direction } as PlayerForInput,
  };
}

function pressKey(
  key: string,
  playerRef: { current: PlayerForInput },
  steeringMode: "absolute" | "relative",
  onReset: () => void = () => {}
): { defaultPrevented: boolean } {
  let defaultPrevented = false;
  const event = {
    key,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as unknown as KeyboardEvent;

  handleKeyDown(event, playerRef as never, onReset, steeringMode);
  return { defaultPrevented };
}

describe("absolute steering (flat board view)", () => {
  it("maps arrows and WASD to compass headings", () => {
    const cases: Array<[string, Direction]> = [
      ["ArrowUp", "up"],
      ["ArrowDown", "down"],
      ["ArrowLeft", "left"],
      ["ArrowRight", "right"],
      ["w", "up"],
      ["S", "down"],
      ["a", "left"],
      ["D", "right"],
    ];

    for (const [key, expected] of cases) {
      const playerRef = makePlayerRef("up");
      pressKey(key, playerRef, "absolute");
      expect(playerRef.current.pendingDirection).toBe(expected);
    }
  });
});

describe("relative steering (cockpit view)", () => {
  it("turns right from the bike's point of view while riding south", () => {
    // The reported bug: pressing right while heading down used to send the
    // bike east, which is the player's left on screen.
    const playerRef = makePlayerRef("down");
    pressKey("ArrowRight", playerRef, "relative");
    expect(playerRef.current.pendingDirection).toBe("left");
  });

  it("turns left from the bike's point of view while riding south", () => {
    const playerRef = makePlayerRef("down");
    pressKey("ArrowLeft", playerRef, "relative");
    expect(playerRef.current.pendingDirection).toBe("right");
  });

  it("keeps the heading when the player presses forward or reverse", () => {
    const playerRef = makePlayerRef("left");
    pressKey("ArrowUp", playerRef, "relative");
    expect(playerRef.current.pendingDirection).toBe("left");
    pressKey("ArrowDown", playerRef, "relative");
    expect(playerRef.current.pendingDirection).toBe("left");
  });

  it("resolves against the applied heading, not the buffered one", () => {
    // Two presses inside one tick must not stack into a rejected U-turn.
    const playerRef = makePlayerRef("up");
    pressKey("ArrowRight", playerRef, "relative");
    pressKey("ArrowRight", playerRef, "relative");
    expect(playerRef.current.pendingDirection).toBe("right");
  });
});

describe("other keys", () => {
  it("resets the round on R and swallows the key", () => {
    const playerRef = makePlayerRef("up");
    let resets = 0;
    const result = pressKey("R", playerRef, "absolute", () => {
      resets += 1;
    });

    expect(resets).toBe(1);
    expect(result.defaultPrevented).toBe(true);
  });

  it("leaves unrelated keys to the browser", () => {
    const playerRef = makePlayerRef("up");
    const result = pressKey("Tab", playerRef, "absolute");

    expect(result.defaultPrevented).toBe(false);
    expect(playerRef.current.pendingDirection).toBe("up");
  });
});
