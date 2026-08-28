// src/setupTests.ts
// Adds the DOM matchers (toBeInTheDocument, toHaveTextContent, ...) to expect.
import "@testing-library/jest-dom/vitest";

/**
 * jsdom ships no matchMedia. Components that ask the device what it is get a
 * desktop answer, which is what the tests assume.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
