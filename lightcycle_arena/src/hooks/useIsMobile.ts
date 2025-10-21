// src/hooks/useIsMobile.ts
import { useEffect, useState } from "react";

/**
 * Detects if the current device should be treated as mobile.
 * It uses both pointer type (touch) and screen width heuristics.
 */
export function useIsMobile(): boolean {
  const [isMobileDevice, setIsMobileDevice] = useState<boolean>(false);

  useEffect(() => {
    // Evaluate both coarse pointer and screen width
    const hasTouchInput = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const isNarrowScreen = window.matchMedia?.("(max-width: 768px)").matches ?? false;

    setIsMobileDevice(hasTouchInput || isNarrowScreen);

    // Watch for changes in device or screen width
    function handleMediaQueryChange() {
      const updatedHasTouchInput = window.matchMedia?.("(pointer: coarse)").matches ?? false;
      const updatedIsNarrowScreen = window.matchMedia?.("(max-width: 768px)").matches ?? false;
      setIsMobileDevice(updatedHasTouchInput || updatedIsNarrowScreen);
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
