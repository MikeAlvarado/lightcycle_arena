// src/components/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level crash guard. Without this, an uncaught render error (e.g. from
 * unexpectedly-shaped data) white-screens the app with no way back short of
 * clearing site data manually.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Lightcycle Arena crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            height: "100dvh",
            width: "100vw",
            background: "#0b0b0b",
            color: "#eaeaea",
            textAlign: "center",
            padding: 16,
          }}
        >
          <h1 style={{ color: "#00e0ff" }}>Something went wrong.</h1>
          <p>Please reload to keep playing.</p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              fontSize: "1rem",
              borderRadius: 8,
              border: "1px solid #00e0ff",
              background: "rgba(0,0,0,0.8)",
              color: "#00e0ff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
