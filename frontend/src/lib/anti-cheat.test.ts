/**
 * Machine-regularity test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/anti-cheat.test.ts
 *
 * The two properties that matter: a machine-steady rhythm is caught, and a
 * human-sloppy one never is — a false positive would leave the alarm
 * unsilenceable.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_REGULARITY_OPTIONS,
  ShakeRegularity,
  type RegularityOptions,
} from './anti-cheat';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Deterministic LCG so the test can never flake. */
function makeRandom(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Feed strokes at `mean` ms apart, wobbling by ±`jitter` fraction. */
function feed(
  detector: ShakeRegularity,
  strokes: number,
  mean: number,
  jitter: number,
  seed = 7
) {
  const random = makeRandom(seed);
  let at = 1_000_000;
  for (let i = 0; i < strokes; i += 1) {
    detector.push(at);
    at += mean * (1 + (random() - 0.5) * 2 * jitter);
  }
}

console.log('anti-cheat');

check('a human-sloppy rhythm is never accused', () => {
  // People vary by roughly this much between strokes.
  for (const jitter of [0.15, 0.25, 0.4]) {
    const detector = new ShakeRegularity();
    feed(detector, 40, 140, jitter);
    assert.equal(
      detector.isMechanical,
      false,
      `jitter ${jitter} produced variation ${detector.variation}`
    );
  }
});

check('a machine-steady rhythm is caught', () => {
  const detector = new ShakeRegularity();
  feed(detector, 30, 120, 0.005);
  assert.equal(detector.isMechanical, true, `variation ${detector.variation}`);
});

check('nothing is judged before the window is full', () => {
  const detector = new ShakeRegularity();
  for (let i = 0; i < DEFAULT_REGULARITY_OPTIONS.minSamples; i += 1) {
    detector.push(i * 120);
  }
  // minSamples intervals need minSamples+1 onsets; still short of the bar.
  assert.equal(detector.variation, null);
  assert.equal(detector.isMechanical, false);
});

check('the accusation clears once the rhythm breaks', () => {
  const detector = new ShakeRegularity();
  feed(detector, 30, 120, 0.005);
  assert.equal(detector.isMechanical, true);
  // The user starts shaking by hand instead.
  feed(detector, 30, 130, 0.35, 99);
  assert.equal(detector.isMechanical, false, `variation ${detector.variation}`);
});

check('a pause ends the burst and clears the evidence', () => {
  const detector = new ShakeRegularity();
  feed(detector, 30, 120, 0.005);
  assert.equal(detector.isMechanical, true);
  // Two seconds of nothing.
  detector.push(2_000_000 + 5_000);
  assert.equal(detector.sampleCount, 0);
  assert.equal(detector.isMechanical, false);
});

check('the sensor sample rate is not mistaken for strokes', () => {
  const detector = new ShakeRegularity();
  // 16 ms apart is one stroke read at the accelerometer's rate, not 8 strokes.
  for (let i = 0; i < 30; i += 1) detector.push(1_000_000 + i * 16);
  assert.equal(detector.sampleCount, 0);
  assert.equal(detector.isMechanical, false);
});

check('non-finite timestamps are ignored', () => {
  const detector = new ShakeRegularity();
  detector.push(Number.NaN);
  detector.push(1_000_000);
  detector.push(Number.POSITIVE_INFINITY);
  assert.ok(detector.sampleCount <= 1);
});

check('the first onset only starts the clock', () => {
  const detector = new ShakeRegularity();
  detector.push(1_000_000);
  assert.equal(detector.sampleCount, 0);
  detector.push(1_000_120);
  assert.equal(detector.sampleCount, 1);
});

check('the window stays bounded', () => {
  const detector = new ShakeRegularity();
  feed(detector, 200, 120, 0.005);
  assert.equal(detector.sampleCount, DEFAULT_REGULARITY_OPTIONS.windowSize);
});

check('reset clears everything', () => {
  const detector = new ShakeRegularity();
  feed(detector, 30, 120, 0.005);
  detector.reset();
  assert.equal(detector.sampleCount, 0);
  assert.equal(detector.isMechanical, false);
});

check('options can be tuned', () => {
  const strict: RegularityOptions = {
    ...DEFAULT_REGULARITY_OPTIONS,
    maxCv: 0.001,
  };
  const detector = new ShakeRegularity(strict);
  feed(detector, 30, 120, 0.02);
  // 2% wobble clears a 0.1% bar.
  assert.equal(detector.isMechanical, false);
});

console.log(`\n${passed} checks passed`);
