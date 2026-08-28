// src/audio/soundEngine.test.ts
import { createSoundEngine, getSoundEngine } from "./soundEngine";

describe("soundEngine", () => {
  it("stays quiet and out of the way where there is no Web Audio", () => {
    // jsdom ships no AudioContext, which is the same situation as a browser
    // that blocks audio: the game must carry on regardless.
    expect(window.AudioContext).toBeUndefined();

    const engine = createSoundEngine();
    expect(() => {
      engine.setMuted(true);
      engine.startEngine(0.5);
      engine.turn();
      engine.crash();
      engine.levelClear();
      engine.stopEngine();
      engine.dispose();
    }).not.toThrow();
  });

  it("shares one engine across the app", () => {
    expect(getSoundEngine()).toBe(getSoundEngine());
  });
});
