import type { CSSProperties } from "react";

/**
 * Fills the parent "controls-zone" (mobile bottom area).
 * The parent already uses flex to size itself, so we just fill it
 * and center the pad with CSS grid.
 */
export const dPadFillWrapperStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  padding: 8,

  background: "#0e0e0e",
};

/** Square pad grid that scales but never overflows its parent */
export const dPadContainerStyle: CSSProperties = {
  width: "clamp(220px, 70vw, 360px)",
  aspectRatio: "1 / 1",
  maxHeight: "92%",
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gridTemplateRows: "repeat(3, 1fr)",
  gap: "clamp(8px, 2.5vh, 14px)",
  opacity: 0.96,
};

export const buttonStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid #3a3a3a",
  background: "#1f1f1f",
  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.35)",
  display: "grid",
  placeItems: "center",
  fontSize: 18,
  color: "#f0f4ff",
  userSelect: "none",
  WebkitTapHighlightColor: "transparent",
};

export const labelStyle: CSSProperties = {
  opacity: 0.9,
  fontWeight: 700,
};

export const centerCellContainerStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
};

export const resetButtonStyle: CSSProperties = {
  width: "70%",
  aspectRatio: "1 / 1",
  borderRadius: "9999px",
  border: "1px solid #3a3a3a",
  background: "#2a2a2a",
  boxShadow: "inset 0 4px 10px rgba(0,0,0,0.45)",
  display: "grid",
  placeItems: "center",
  color: "#f0f4ff",
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
