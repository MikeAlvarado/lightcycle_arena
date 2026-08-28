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
    // Two people, nobody steering: the bikes start nose to nose on the same
    // column, so this is a head-on every time. Riders used to be resolved one
    // after the other, and whoever went second rode away from it unharmed.
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2 Players" }));

    runFrames(4000);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Draw");
    expect(dialog).toHaveTextContent("Yellow and Cyan went head-on.");

    // A draw is nobody's round.
    expect(screen.getByText(/^Yellow: 0$/)).toBeInTheDocument();
    expect(screen.getByText(/^Cyan: 0$/)).toBeInTheDocument();
  });

  it("holds the verdict back so the wreck can be watched, but not the pause", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));

    runFrames(300);
    fireEvent.keyDown(window, { key: "Escape" });
    // A pause is not a crash: it arrives at once.
    expect(screen.getByRole("dialog").className).not.toContain("is-crash");

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    runFrames(4000);

    expect(screen.getByRole("dialog").className).toContain("is-crash");
  });

  it("credits the round to whoever is left standing, and says what happened", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2 Players" }));

    // Break the symmetry so the round ends with one rider down rather than two.
    // Which of the two walls claims them is a matter of a tick either way, so
    // this asserts the bookkeeping rather than the timing.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    runFrames(4000);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("takes the round");
    expect(dialog).toHaveTextContent(/wall/);

    const tallyFor = (rider: string): number =>
      Number(screen.getByText(new RegExp(`^${rider}: \\d+$`)).textContent!.split(": ")[1]);

    expect(tallyFor("Yellow") + tallyFor("Cyan")).toBe(1);
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

  it("pauses on Escape too, which is where a hand already is", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));

    runFrames(300);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.getByRole("dialog")).toHaveTextContent("Paused");
  });

  it("cuts the wall on Space and puts it back", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: /Jet Wall/ }));
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));
    runFrames(300);

    expect(screen.getByRole("meter", { name: "Jet wall power" })).toBeInTheDocument();
    expect(screen.getByText("Jet wall")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Wall off")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByText("Jet wall")).toBeInTheDocument();
  });

  it("keeps the jet wall out of the way when the rule is off", () => {
    render(<GameCanvas />);
    fireEvent.click(screen.getByRole("button", { name: "2D Classic" }));
    runFrames(300);

    expect(screen.queryByRole("meter")).not.toBeInTheDocument();

    // Space is the menu's start key, not a game key, so it must do nothing here.
    fireEvent.keyDown(window, { key: " " });
    expect(screen.queryByText("Wall off")).not.toBeInTheDocument();
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

    // Lives are pips on the HUD, so the count is read off the label rather
    // than off however many hearts happen to be drawn.
    expect(screen.getByLabelText("3 lives left")).toBeInTheDocument();

    runFrames(300);
    fireEvent.keyDown(window, { key: "r" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByLabelText("2 lives left")).toBeInTheDocument();
  });
});
