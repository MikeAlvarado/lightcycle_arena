import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      // v7 exposes the eslintrc-shaped configs at the top level and the flat
      // ones under `flat`.
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The game loop keeps its mutable state in refs on purpose: it updates at
    // display rate and must not re-render React. The overlay's callbacks read
    // those refs when the player clicks them, not while rendering, which this
    // rule cannot tell apart from a genuine read during render.
    files: ["src/components/GameCanvas.tsx"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  {
    // Test files run in Vitest, whose globals are injected by the runner.
    files: ["**/*.test.{ts,tsx}", "src/setupTests.ts"],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    // Config files run in Node, not the browser.
    files: ["*.config.{js,ts}"],
    languageOptions: {
      globals: globals.node,
    },
  }
);
