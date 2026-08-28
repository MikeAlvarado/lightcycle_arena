// src/render/loadThreeRenderer.ts

/**
 * three.js weighs about 150 kB gzipped, and the flat board never touches it.
 * Loading it dynamically keeps it out of the first download; the menu warms the
 * chunk up so the opening frame of a cockpit run isn't waiting on the network.
 *
 * The promise is cached, so switching views repeatedly costs one fetch.
 */
let modulePromise: Promise<typeof import("./threeRenderer")> | null = null;

export function loadThreeRenderer(): Promise<typeof import("./threeRenderer")> {
  if (!modulePromise) modulePromise = import("./threeRenderer");
  return modulePromise;
}
