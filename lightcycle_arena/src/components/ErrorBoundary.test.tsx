// src/components/ErrorBoundary.test.tsx
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Bomb(): JSX.Element {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("shows a fallback instead of a blank screen when a child throws", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByRole("button", { name: /reload/i })).toBeDefined();

    consoleErrorSpy.mockRestore();
  });
});
