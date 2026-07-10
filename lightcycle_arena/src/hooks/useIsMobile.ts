// src/hooks/useIsMobile.ts
import { useEffect, useState } from "react";

/**
 * Detects if the current device should be treated as mobile.
 * It uses both pointer type (touch) and screen width heuristics.
 */
function evaluateIsMobile(): boolean {
  const hasTouchInput = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const isNarrowScreen = window.matchMedia?.("(max-width: 768px)").matches ?? false;
  return hasTouchInput || isNarrowScreen;
}

export function useIsMobile(): boolean {
  // Lazy initializer: correct value on first render, so mobile devices don't
  // flash the desktop layout before the effect runs.
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(evaluateIsMobile);

  useEffect(() => {
    // Watch for changes in device or screen width
    function handleMediaQueryChange() {
      setIsMobileDevice(evaluateIsMobile());
    }

    const touchMediaQuery = window.matchMedia("(pointer: coarse)");
    const widthMediaQuery = window.matchMedia("(max-width: 768px)");

    touchMediaQuery.addEventListener("change", handleMediaQueryChange);
    widthMediaQuery.addEventListener("change", handleMediaQueryChange);

    return () => {
      touchMediaQuery.removeEventListener("change", handleMediaQueryChange);
      widthMediaQuery.removeEventListener("change", handleMediaQueryChange);
    };
  }, []);

  return isMobileDevice;
}
