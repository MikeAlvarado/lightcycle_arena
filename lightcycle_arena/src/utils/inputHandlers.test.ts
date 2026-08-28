// src/utils/inputHandlers.test.ts
import { handleKeyDown, intentForKey } from "./inputHandlers";
import type { KeyboardControls } from "./inputHandlers";
import type { PlayerForInput } from "../types/player";
import type { Direction } from "./latticeHelpers";
import type { SteeringMode } from "./steering";

function makeControls(
  direction: Direction,
  scheme: KeyboardControls["scheme"],
  steeringMode: SteeringMode
) {
  const playerRef = {
    current: { direction, pendingDirection: direction } as PlayerForInput,
  };
  return { playerRef, control: { playerRef, scheme, steeringMode } as KeyboardControls };
}

function pressKey(
  key: string,
  controls: KeyboardControls[],
  onReset: () => void = () => {},
  onTogglePause?: () => void
): boolean {
  let defaultPrevented = false;
  const event = {
    key,
    preventDefault: () => {
      defaultPrevented = true;
    },
  } as unknown as KeyboardEvent;

  handleKeyDown(event, controls, onReset, onTogglePause);
  return defaultPrevented;
}

describe("intentForKey", () => {
  it("keeps the two keyboard halves apart", () => {
    expect(intentForKey("ArrowLeft", "arrows")).toBe("left");
    expect(intentForKey("a", "arrows")).toBeNull();
    expect(intentForKey("a", "wasd")).toBe("left");
    expect(intentForKey("ArrowLeft", "wasd")).toBeNull();
    expect(intentForKey("A", "both")).toBe("left");
    expect(intentForKey("ArrowLeft", "both")).toBe("left");
  });

  it("ignores keys that belong to nobody", () => {
    expect(intentForKey("Tab", "both")).toBeNull();
    expect(intentForKey("q", "both")).toBeNull();
  });
});

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
      const { playerRef, control } = makeControls("up", "both", "absolute");
      pressKey(key, [control]);
      expect(playerRef.current.pendingDirection).toBe(expected);
    }
  });
});

describe("relative steering (cockpit view)", () => {
  it("turns right from the bike's point of view while riding south", () => {
    // The reported bug: pressing right while heading down used to send the
    // bike east, which is the player's left on screen.
    const { playerRef, control } = makeControls("down", "both", "relative");
    pressKey("ArrowRight", [control]);
    expect(playerRef.current.pendingDirection).toBe("left");
  });

  it("keeps the heading when the player presses forward or reverse", () => {
    const { playerRef, control } = makeControls("left", "both", "relative");
    pressKey("ArrowUp", [control]);
    expect(playerRef.current.pendingDirection).toBe("left");
    pressKey("ArrowDown", [control]);
    expect(playerRef.current.pendingDirection).toBe("left");
  });

  it("resolves against the applied heading, not the buffered one", () => {
    // Two presses inside one tick must not stack into a rejected U-turn.
    const { playerRef, control } = makeControls("up", "both", "relative");
    pressKey("ArrowRight", [control]);
    pressKey("ArrowRight", [control]);
    expect(playerRef.current.pendingDirection).toBe("right");
  });
});

describe("two riders on one keyboard", () => {
  it("sends the arrows to one and WASD to the other", () => {
    const first = makeControls("up", "arrows", "absolute");
    const second = makeControls("down", "wasd", "absolute");
    const controls = [first.control, second.control];

    pressKey("ArrowLeft", controls);
    expect(first.playerRef.current.pendingDirection).toBe("left");
    expect(second.playerRef.current.pendingDirection).toBe("down");

    pressKey("d", controls);
    expect(first.playerRef.current.pendingDirection).toBe("left");
    expect(second.playerRef.current.pendingDirection).toBe("right");
  });
});

describe("other keys", () => {
  it("resets the round on R and pauses on P", () => {
    const { control } = makeControls("up", "both", "absolute");
    let resets = 0;
    let pauses = 0;

    expect(pressKey("R", [control], () => { resets += 1; }, () => { pauses += 1; })).toBe(true);
    expect(pressKey("p", [control], () => { resets += 1; }, () => { pauses += 1; })).toBe(true);
    expect(resets).toBe(1);
    expect(pauses).toBe(1);
  });

  it("leaves unrelated keys to the browser", () => {
    const { playerRef, control } = makeControls("up", "both", "absolute");
    expect(pressKey("Tab", [control])).toBe(false);
    expect(playerRef.current.pendingDirection).toBe("up");
  });
});
