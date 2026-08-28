// src/audio/soundEngine.ts

/**
 * Every sound here is synthesised on the fly: no audio files to ship, no
 * licences to track, and the engine note can follow the arena's speed.
 *
 * Browsers refuse to start audio before the player interacts with the page, so
 * the AudioContext is created on the first sound and resumed if it was
 * suspended. Where there is no Web Audio at all (jsdom, locked-down browsers)
 * every call is a no-op rather than a crash.
 */
export interface SoundEngine {
  setMuted(muted: boolean): void;
  /** Start the idling engine drone. `speed` is 0..1, slow arena to fast. */
  startEngine(speed: number): void;
  stopEngine(): void;
  turn(): void;
  crash(): void;
  levelClear(): void;
  dispose(): void;
}

type AudioContextConstructor = new () => AudioContext;

const MASTER_VOLUME = 0.22;
const ENGINE_VOLUME = 0.05;

function resolveAudioContext(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;

  const candidate =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;

  return candidate ?? null;
}

export function createSoundEngine(): SoundEngine {
  const AudioContextClass = resolveAudioContext();

  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let engineOscillator: OscillatorNode | null = null;
  let engineGain: GainNode | null = null;
  let muted = false;

  function ensureContext(): AudioContext | null {
    if (!AudioContextClass) return null;

    try {
      if (!context) {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = muted ? 0 : MASTER_VOLUME;
        master.connect(context.destination);
      }
      // Autoplay policy: the context starts suspended until a gesture.
      if (context.state === "suspended") void context.resume();
      return context;
    } catch {
      // Audio is a nicety; never let it take the game down.
      return null;
    }
  }

  /** One short tone with an exponential tail. */
  function playTone(
    type: OscillatorType,
    startFrequency: number,
    endFrequency: number,
    durationSeconds: number,
    volume: number,
    delaySeconds = 0
  ): void {
    const audio = ensureContext();
    if (!audio || !master || muted) return;

    const startTime = audio.currentTime + delaySeconds;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      startTime + durationSeconds
    );

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSeconds);

    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(startTime);
    oscillator.stop(startTime + durationSeconds);
  }

  return {
    setMuted(nextMuted: boolean): void {
      muted = nextMuted;
      if (master && context) {
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, context.currentTime, 0.02);
      }
    },

    startEngine(speed: number): void {
      const audio = ensureContext();
      if (!audio || !master) return;

      const frequency = 46 + Math.max(0, Math.min(1, speed)) * 26;

      if (engineOscillator && engineGain) {
        engineOscillator.frequency.setTargetAtTime(frequency, audio.currentTime, 0.1);
        return;
      }

      try {
        engineOscillator = audio.createOscillator();
        engineGain = audio.createGain();

        engineOscillator.type = "sawtooth";
        engineOscillator.frequency.setValueAtTime(frequency, audio.currentTime);
        engineGain.gain.setValueAtTime(0, audio.currentTime);
        engineGain.gain.setTargetAtTime(ENGINE_VOLUME, audio.currentTime, 0.25);

        engineOscillator.connect(engineGain);
        engineGain.connect(master);
        engineOscillator.start();
      } catch {
        engineOscillator = null;
        engineGain = null;
      }
    },

    stopEngine(): void {
      if (!engineOscillator || !engineGain || !context) return;

      const stopAt = context.currentTime + 0.2;
      engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      engineOscillator.stop(stopAt);
      engineOscillator = null;
      engineGain = null;
    },

    turn(): void {
      playTone("square", 620, 900, 0.07, 0.16);
    },

    crash(): void {
      // A dive plus a rough overtone reads as a wreck without a noise buffer.
      playTone("sawtooth", 320, 40, 0.55, 0.3);
      playTone("square", 180, 30, 0.45, 0.18, 0.02);
    },

    levelClear(): void {
      playTone("triangle", 523, 523, 0.12, 0.2);
      playTone("triangle", 659, 659, 0.12, 0.2, 0.12);
      playTone("triangle", 880, 880, 0.24, 0.22, 0.24);
    },

    dispose(): void {
      this.stopEngine();
      try {
        void context?.close();
      } catch {
        // Already closed or never opened.
      }
      context = null;
      master = null;
    },
  };
}

let sharedEngine: SoundEngine | null = null;

/** One engine for the whole app, created the first time a sound is asked for. */
export function getSoundEngine(): SoundEngine {
  if (!sharedEngine) sharedEngine = createSoundEngine();
  return sharedEngine;
}
