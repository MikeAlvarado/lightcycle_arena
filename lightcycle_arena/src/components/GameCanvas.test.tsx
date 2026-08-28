// src/components/GameCanvas.test.tsx
import { act, fireEvent, render, screen } from "@testing-library/react";

import { GameCanvas } from "./GameCanvas";

/**
 * jsdom has no canvas and no Path2D. The renderers only ever write to them, so
 * a proxy that accepts every call and returns itself is enough to run the whole
 * game loop headlessly — which is the only way to test the loop end to end.
 */
function stubCanvasApis(): void {
  const context: unknown = new Proxy(function noop() {}, {
    get: () => context,
    apply: () => context,
    set: () => true,
  });

  HTMLCanvasElement.prototype.getContext = (() => context) as never;
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo(): void {}
    lineTo(): void {}
    closePath(): void {}
    arc(): void {}
  };
}

/** Run the game loop for a while, the way the browser would. */
function runFrames(milliseconds: number): void {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

describe("GameCanvas", () => {
  beforeEach(() => {
    stubCanvasApis();
    localStorage.clear();
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "setTimeout",
        "clearTimeout",
        "performance",
        "Date",
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the menu with every way to play", () => {
    render(<GameCanvas />);

    expect(screen.getByRole("button", { name: "2D Classic" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3D Cockpit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 Players" })).toBeInTheDocument();
  });

  it("takes both riders down when they meet head-on", () => {
    // Two people, nobody steering: the bikes spawn facing each other on the
    // same column, so this is a head-on every time. Whoever the loop resolves
    // second used to ride away from it unharmed.
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2 Players" }));

    runFrames(3000);

    expect(screen.getByRole("dialog")).toHaveTextContent("Draw");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Yellow and Cyan went head-on."
    );
    // A draw is nobody's round.
    expect(screen.getByText(/Yellow: 0/)).toBeInTheDocument();
    expect(screen.getByText(/Cyan: 0/)).toBeInTheDocument();
  });

  it("names the wall a rider hit", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2 Players" }));

    // Send player one into the arena wall on the left instead.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    runFrames(4000);

    expect(screen.getByRole("dialog")).toHaveTextContent("Yellow hit the arena wall.");
    expect(screen.getByText(/Cyan: 1/)).toBeInTheDocument();
  });

  it("pauses on P and carries on where it left off", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));

    runFrames(300);
    fireEvent.keyDown(window, { key: "p" });

    expect(screen.getByRole("dialog")).toHaveTextContent("Paused");

    // The arena is frozen: a paused round can't end.
    runFrames(5000);
    expect(screen.getByRole("dialog")).toHaveTextContent("Paused");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("pauses itself when the tab goes away", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));
    runFrames(300);

    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByRole("dialog")).toHaveTextContent("Paused");
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
  });

  it("costs a life to reset the round, so it can't be used to dodge a crash", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));

    expect(screen.getByText(/Lives: ❤❤❤/)).toBeInTheDocument();

    runFrames(300);
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText(/Lives: ❤❤$/)).toBeInTheDocument();
  });
});
