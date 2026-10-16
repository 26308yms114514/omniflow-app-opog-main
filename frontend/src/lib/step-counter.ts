/**
 * Step detection from raw acceleration magnitude.
 *
 * The `steps` task ("原地踏步") claims to count steps but previously reused the
 * generic shake threshold, so holding the phone still while bobbing it counted
 * the same as actually marching. This is a small peak detector tuned for the
 * periodic vertical bounce of marching in place.
 *
 * Kept free of browser APIs so the algorithm can be exercised against
 * synthetic sample streams.
 */

export interface StepCounterOptions {
  /** Minimum gap between two counted steps, in milliseconds. */
  refractoryMs: number;
  /** How far above the adaptive baseline a peak must reach, in m/s². */
  threshold: number;
  /**
   * Baseline tracking rate (0-1). Small values make the baseline a slow
   * average, so sustained motion does not drag the threshold up with it.
   */
  smoothing: number;
  /** A peak must fall this far back below the threshold before the next counts. */
  releaseRatio: number;
  /** Samples spent converging the baseline before any step may be counted. */
  warmupSamples: number;
  /** Faster tracking during warm-up, so a start on a peak settles quickly. */
  warmupSmoothing: number;
}

/**
 * Per-sensitivity detection thresholds. Marching produces a few m/s² of
 * vertical swing once gravity is removed, so these sit well below the shake
 * thresholds used for the motion tasks.
 */
export const STEP_THRESHOLDS = {
  high: 1.5,
  medium: 2.5,
  low: 4,
} as const;

export const DEFAULT_STEP_OPTIONS: StepCounterOptions = {
  refractoryMs: 250,
  threshold: STEP_THRESHOLDS.medium,
  smoothing: 0.02,
  releaseRatio: 0.5,
  warmupSamples: 25,
  warmupSmoothing: 0.25,
};

export class StepCounter {
  private options: StepCounterOptions;
  private baseline = 0;
  private seen = 0;
  private armed = true;
  private lastStepAt = Number.NEGATIVE_INFINITY;
  private steps = 0;

  constructor(options: Partial<StepCounterOptions> = {}) {
    this.options = { ...DEFAULT_STEP_OPTIONS, ...options };
  }

  get count(): number {
    return this.steps;
  }

  reset(): void {
    this.baseline = 0;
    this.seen = 0;
    this.armed = true;
    this.lastStepAt = Number.NEGATIVE_INFINITY;
    this.steps = 0;
  }

  setThreshold(threshold: number): void {
    this.options = { ...this.options, threshold };
  }

  /**
   * Feed one sample. Returns true on the sample that completes a step.
   *
   * @param magnitude acceleration magnitude in m/s² (gravity included)
   * @param timestampMs sample time in milliseconds
   */
  push(magnitude: number, timestampMs: number): boolean {
    if (!Number.isFinite(magnitude)) return false;

    // Warm-up: track the baseline aggressively and do not count anything.
    // Without this, starting mid-bounce would park the baseline on a peak and
    // blind the detector for the first second or two of marching.
    if (this.seen < this.options.warmupSamples) {
      this.baseline =
        this.seen === 0
          ? magnitude
          : this.baseline + (magnitude - this.baseline) * this.options.warmupSmoothing;
      this.seen += 1;
      return false;
    }

    this.baseline += (magnitude - this.baseline) * this.options.smoothing;
    const delta = magnitude - this.baseline;

    if (delta >= this.options.threshold) {
      if (!this.armed) return false;
      // Re-arm only after the signal falls back, so one bounce cannot be
      // counted repeatedly across consecutive samples.
      this.armed = false;
      if (timestampMs - this.lastStepAt < this.options.refractoryMs) return false;
      this.lastStepAt = timestampMs;
      this.steps += 1;
      return true;
    }

    if (delta <= this.options.threshold * this.options.releaseRatio) {
      this.armed = true;
    }

    return false;
  }
}

/** Acceleration magnitude, gravity included, from a three-axis sample. */
export function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}
