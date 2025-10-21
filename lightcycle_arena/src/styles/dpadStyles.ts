// src/styles/dpadStyles.ts

/**
 * Centralized style definitions for the DPadOverlay component.
 * These are simple React CSSProperties exported as constants
 * for clarity and reusability.
 */

import { CSSProperties } from "react";

export const dPadWrapperStyle: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  width: "100vw",
  height: "50vh", // half the viewport height
  display: "grid",
  placeItems: "center",
  padding: 12,
  background:
    "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.25) 60%, rgba(0,0,0,0))",
  zIndex: 10,
  touchAction: "manipulation",
};

export const dPadContainerStyle: CSSProperties = {
  width: "min(80vw, 480px)",
  aspectRatio: "1 / 1",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(3, 1fr)",
  gap: 12,
  opacity: 0.95,
};

export const buttonStyle: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(30,30,30,0.9)",
  boxShadow: "0 2px 12px rgba(0,0,0,0.35) inset, 0 6px 18px rgba(0,0,0,0.35)",
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  color: "#e7f0ff",
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

export const labelStyle: CSSProperties = {
  opacity: 0.8,
  fontWeight: 600,
};

export const centerCellContainerStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
};

export const resetButtonStyle: CSSProperties = {
  width: "70%",
  aspectRatio: "1 / 1",
  borderRadius: "9999px",
  border: "1px solid rgba(255,255,255,0.25)",
  background:
    "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.12), rgba(0,0,0,0.35))",
  boxShadow:
    "inset 0 4px 10px rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.35)",
  display: "grid",
  placeItems: "center",
  color: "#ffcccc",
  fontWeight: 700,
  fontSize: 16,
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

export const resetLabelStyle: CSSProperties = {
  letterSpacing: 0.5,
  textTransform: "uppercase",
  opacity: 0.9,
};