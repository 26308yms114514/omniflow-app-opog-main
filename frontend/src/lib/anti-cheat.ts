/**
 * Machine-regularity detection — the app's headline anti-cheat claim.
 *
 * The landing page names this algorithm (「加速度计频率方差分析」) as the defence
 * against propping the phone on a fan or a mechanical shaker, and advertises a
 * 95% interception rate. Nothing implemented it. This is that analysis, done
 * for real.
 *
 * The idea: a person shaking a phone is sloppy. The gaps between strokes wander
 * by tens of percent. A machine driven by a fan or a shaker repeats with almost
 * no variation at all. So measure the coefficient of variation (standard
 * deviation ÷ mean) of the recent stroke intervals.
 *
 * Design constraints, because a false positive here makes the alarm impossible
 * to silence:
 *
 *   - the threshold is deliberately strict (8% variation), well below anything
 *     a human produces by hand;
 *   - a judgement needs a full window of strokes, so a few lucky beats cannot
 *     accuse anyone;
 *   - the state is transient. The moment the rhythm breaks the window refills
 *     and the flag clears, so a misjudged user simply keeps moving and is
 *     believed again.
 *
 * Kept free of browser APIs so the statistics can be tested directly.
 */

export interface RegularityOptions {
  /** How many stroke intervals are kept for the judgement. */
  windowSize: number;
  /** Intervals required before any judgement is made. */
  minSamples: number;
  /** Coefficient of variation at or below which the motion is machine-like. */
  maxCv: number;
  /** Gaps shorter than this are the sensor's own sample rate, not strokes. */
  minIntervalMs: number;
  /** A gap longer than this ends the burst; the window starts over. */
  maxIntervalMs: number;
}

export const DEFAULT_REGULARITY_OPTIONS: RegularityOptions = {
  windowSize: 12,
  minSamples: 8,
  maxCv: 0.08,
  minIntervalMs: 40,
  maxIntervalMs: 1500,
};

export class ShakeRegularity {
  private options: RegularityOptions;
  private lastAt: number | null = null;
  private intervals: number[] = [];

  constructor(options: Partial<RegularityOptions> = {}) {
    this.options = { ...DEFAULT_REGULARITY_OPTIONS, ...options };
  }

  /** Record one motion onset (a rising edge, not every above-threshold sample). */
  push(timestampMs: number): void {
    if (!Number.isFinite(timestampMs)) return;

    const previous = this.lastAt;
    this.lastAt = timestampMs;
    if (previous === null) return;

    const gap = timestampMs - previous;

    // Sub-sample-rate gaps are consecutive readings of the same stroke.
    if (gap < this.options.minIntervalMs) return;

    // A pause ends the burst; a machine that stopped is not evidence.
    if (gap > this.options.maxIntervalMs) {
      this.intervals = [];
      return;
    }

    this.intervals.push(gap);
    if (this.intervals.length > this.options.windowSize) {
      this.intervals.shift();
    }
  }

  /** How many intervals the current window holds. */
  get sampleCount(): number {
    return this.intervals.length;
  }

  /**
   * Coefficient of variation of the window, or null while there is not enough
   * evidence to say anything.
   */
  get variation(): number | null {
    if (this.intervals.length < this.options.minSamples) return null;
    const mean =
      this.intervals.reduce((total, value) => total + value, 0) / this.intervals.length;
    if (mean <= 0) return null;
    const variance =
      this.intervals.reduce((total, value) => total + (value - mean) ** 2, 0) /
      this.intervals.length;
    return Math.sqrt(variance) / mean;
  }

  /** True when the recent rhythm is too even to be a person. */
  get isMechanical(): boolean {
    const cv = this.variation;
    return cv !== null && cv <= this.options.maxCv;
  }

  reset(): void {
    this.lastAt = null;
    this.intervals = [];
  }
}
