/**
 * Retro system sound effects, synthesized with the Web Audio API.
 * Square waves with stepped decay evoke the classic Mac speaker without
 * shipping copyrighted Apple audio files. Every call is fail-silent:
 * sounds must never throw into or block the UI.
 */

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

interface ToneOptions {
  frequency: number;
  /** Seconds. */
  duration: number;
  /** Seconds after now. */
  at?: number;
  volume?: number;
  type?: OscillatorType;
}

function tone({ frequency, duration, at = 0, volume = 0.045, type = "square" }: ToneOptions): void {
  const audio = getContext();
  if (!audio) return;
  try {
    const start = audio.currentTime + at;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  } catch {
    // Sound is decorative; never surface audio failures.
  }
}

/** Short mechanical tick for button, link, and select presses. */
export function playClick(): void {
  tone({ frequency: 1560, duration: 0.028, volume: 0.05 });
  tone({ frequency: 780, duration: 0.02, at: 0.012, volume: 0.025 });
}

/** Two-step rising chirp when a dialog window opens. */
export function playOpen(): void {
  tone({ frequency: 620, duration: 0.05, volume: 0.04 });
  tone({ frequency: 930, duration: 0.06, at: 0.055, volume: 0.04 });
}

/** Classic single error beep for alerts. */
export function playBeep(): void {
  tone({ frequency: 660, duration: 0.18, volume: 0.055 });
}
