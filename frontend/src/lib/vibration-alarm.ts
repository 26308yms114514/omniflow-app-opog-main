/**
 * Vibration alarm.
 *
 * The Web Audio siren produced no sound on a real Android phone, so the alarm
 * channel is now vibration. `navigator.vibrate` takes a pattern of alternating
 * on/off durations and stops when the pattern ends, so keeping an alarm going
 * means re-issuing it on a loop.
 *
 * Two limits worth knowing, both surfaced in the environment self-check:
 *   - iOS Safari does not implement `navigator.vibrate` at all, so there the
 *     alarm has no audible or tactile channel — only the notification;
 *   - a phone lying on a mattress damps vibration heavily, which is a much
 *     weaker wake-up stimulus than a siren.
 *
 * The pattern maths is pure so it can be tested without a device.
 */

import { vibrationAllowed } from './motion';

/** Buzz intensity multiplier: 1 is the configured default, 2 is the penalty cap. */export const MIN_INTENSITY = 0.2;
export const MAX_INTENSITY = 2;

export function clampIntensity(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, level));
}

/**
 * Alternating [on, off, on, off] durations in milliseconds.
 *
 * A higher intensity buzzes longer and pauses less, so each interruption of the
 * task is felt as a more insistent alarm rather than a louder one — the same
 * escalation the volume penalty used to express.
 */
export function vibrationPattern(intensity: number): number[] {
  const scale = clampIntensity(intensity);
  const on = Math.round(400 * scale);
  const off = Math.max(80, Math.round(240 / scale));
  return [on, off, on, off * 3];
}

export function patternDuration(pattern: number[]): number {
  return pattern.reduce((total, value) => total + (value > 0 ? value : 0), 0);
}

export class VibrationAlarm {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private intensity = 1;
  private running = false;

  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentIntensity(): number {
    return this.intensity;
  }

  /**
   * Whether the platform will actually accept a vibration right now. Shares
   * the check with the one-shot helper so the two can never disagree.
   */
  get isAllowed(): boolean {
    return vibrationAllowed();
  }

  /** Intensity multiplier, applied immediately even mid-pattern. */
  setIntensity(level: number): void {
    this.intensity = clampIntensity(level);
    if (this.running) this.pulse();
  }

  /**
   * Begin alarming. Returns false when the platform cannot vibrate, refuses
   * this particular call, or the user has not interacted yet — reporting
   * success there would leave someone waiting for an alarm that will never
   * happen.
   */
  start(): boolean {
    if (!this.isAllowed || this.running) return false;
    this.running = true;
    if (!this.pulse()) {
      this.stop();
      return false;
    }
    return true;
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // Same reasoning as start(): do not issue a call Chrome will refuse and
    // log. If it is blocked there is nothing vibrating to cancel anyway.
    if (!this.isAllowed) return;
    try {
      navigator.vibrate(0);
    } catch {
      // Some builds throw when vibration is disabled by the user.
    }
  }

  /** Issue one pattern and queue the next. Returns whether it was accepted. */
  private pulse(): boolean {
    if (!this.running) return false;
    const pattern = vibrationPattern(this.intensity);
    let accepted = false;
    try {
      accepted = navigator.vibrate(pattern) !== false;
    } catch {
      accepted = false;
    }
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.pulse(), patternDuration(pattern));
    return accepted;
  }
}

/** Single shared instance so the alarm survives route changes. */
let shared: VibrationAlarm | null = null;

export function getVibrationAlarm(): VibrationAlarm {
  if (!shared) shared = new VibrationAlarm();
  return shared;
}
