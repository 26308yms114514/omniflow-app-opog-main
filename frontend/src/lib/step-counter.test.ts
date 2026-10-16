/**
 * Step detection test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/step-counter.test.ts
 *
 * Feeds synthetic acceleration streams so the marching detector is checked
 * against known-good and known-bad input instead of only being eyeballed on a
 * phone.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_STEP_OPTIONS,
  STEP_THRESHOLDS,
  StepCounter,
  magnitude,
} from './step-counter';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const G = 9.81;

/** Deterministic LCG so the test can never flake. */
function makeRandom(seed = 1) {
  let rng = seed;
  return () => {
    rng = (rng * 1103515245 + 12345) % 2147483648;
    return rng / 2147483648 - 0.5;
  };
}

/**
 * Marching at `hz` for `seconds`, sampled at `sampleHz`, producing a sinusoidal
 * swing of `amplitude` m/s² around gravity.
 */
function march(
  counter: StepCounter,
  { hz = 2, seconds = 10, sampleHz = 50, amplitude = 5, noise = 0, seed = 1 } = {}
): number {
  const random = makeRandom(seed);
  const total = Math.round(seconds * sampleHz);
  let counted = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleHz;
    const value = G + amplitude * Math.sin(2 * Math.PI * hz * t) + noise * random();
    if (counter.push(value, (i / sampleHz) * 1000)) counted += 1;
  }
  return counted;
}

/** Feed resting samples to get past the warm-up window. */
function rest(counter: StepCounter, samples: number, startMs = 0, stepMs = 10): number {
  let last = startMs;
  for (let i = 0; i < samples; i += 1) {
    last = startMs + i * stepMs;
    counter.push(G, last);
  }
  return last;
}

console.log('step-counter');

check('magnitude of a gravity-only sample is gravity', () => {
  assert.equal(Math.round(magnitude(0, 0, G) * 100) / 100, G);
  assert.equal(Math.round(magnitude(3, 4, 0)), 5);
});

check('marching at 2 Hz for 10 s counts about 20 steps', () => {
  const counter = new StepCounter();
  const counted = march(counter, { hz: 2, seconds: 10, amplitude: 5 });
  assert.equal(counter.count, counted);
  assert.ok(counted >= 17 && counted <= 22, `expected ~20, got ${counted}`);
});

check('a still phone counts nothing', () => {
  const counter = new StepCounter();
  march(counter, { amplitude: 0, seconds: 10, noise: 0.3 });
  assert.equal(counter.count, 0);
});

check('small jitter below the threshold is ignored', () => {
  const counter = new StepCounter();
  march(counter, { amplitude: 1, seconds: 10, noise: 0.4 });
  assert.equal(counter.count, 0);
});

check('warm-up absorbs a start on a peak', () => {
  // Starting mid-bounce must not park the baseline on the peak: after the
  // warm-up, marching is detected just as reliably as from rest.
  const counter = new StepCounter();
  let counted = 0;
  for (let i = 0; i < 300; i += 1) {
    // Phase-shifted so sample 0 lands on the crest.
    const value = G + 5 * Math.cos((2 * Math.PI * 2 * i) / 50);
    if (counter.push(value, i * 20)) counted += 1;
  }
  assert.ok(counted >= 10, `expected sustained detection, got ${counted}`);
});

check('nothing is counted during the warm-up window', () => {
  const counter = new StepCounter({ warmupSamples: 25 });
  let counted = 0;
  for (let i = 0; i < 25; i += 1) {
    if (counter.push(G + 20, i * 10)) counted += 1;
  }
  assert.equal(counted, 0);
  assert.equal(counter.count, 0);
});

check('refractory period rejects a double bounce', () => {
  const counter = new StepCounter({ refractoryMs: 300 });
  let counted = 0;
  const feed = (value: number, ms: number) => {
    if (counter.push(value, ms)) counted += 1;
  };

  rest(counter, 30);

  feed(G + 6, 1000); // step 1
  feed(G, 1040); // release
  feed(G + 6, 1100); // inside the refractory window -> rejected
  feed(G, 1140); // release
  feed(G + 6, 1500); // step 2

  assert.equal(counted, 2);
});

check('one sustained spike counts exactly once', () => {
  const counter = new StepCounter();
  let counted = 0;
  // Past the warm-up first, otherwise every sample is still settling.
  const start = rest(counter, 30) + 100;
  for (let i = 0; i < 20; i += 1) {
    if (counter.push(G + 8, start + i * 10)) counted += 1;
  }
  assert.equal(counted, 1);
});

check('the arm/release cycle allows a second step', () => {
  const counter = new StepCounter({ refractoryMs: 100 });
  rest(counter, 30);
  const first = counter.push(G + 6, 1000);
  const release = counter.push(G, 1040);
  const second = counter.push(G + 6, 1200);
  assert.equal(first, true);
  assert.equal(release, false);
  assert.equal(second, true);
  assert.equal(counter.count, 2);
});

check('a faster cadence is still counted', () => {
  const counter = new StepCounter();
  const counted = march(counter, { hz: 3, seconds: 10, amplitude: 5 });
  assert.ok(counted >= 25 && counted <= 32, `expected ~28, got ${counted}`);
});

check('higher sensitivity catches weaker marching', () => {
  const weak = { amplitude: 2, seconds: 12 };
  const strict = new StepCounter({ threshold: STEP_THRESHOLDS.low });
  const relaxed = new StepCounter({ threshold: STEP_THRESHOLDS.high });
  const strictCount = march(strict, weak);
  const relaxedCount = march(relaxed, weak);
  assert.ok(
    relaxedCount > strictCount,
    `relaxed ${relaxedCount} should beat strict ${strictCount}`
  );
});

check('reset clears the count and restarts the warm-up', () => {
  const counter = new StepCounter();
  march(counter, { seconds: 5 });
  assert.ok(counter.count > 0);
  counter.reset();
  assert.equal(counter.count, 0);
  assert.equal(counter.push(G + 20, 0), false);
  assert.equal(counter.count, 0);
});

check('non-finite samples are ignored', () => {
  const counter = new StepCounter();
  rest(counter, 30);
  assert.equal(counter.push(Number.NaN, 500), false);
  assert.equal(counter.push(Number.POSITIVE_INFINITY, 520), false);
  assert.equal(counter.count, 0);
});

check('default options are the medium sensitivity', () => {
  assert.equal(DEFAULT_STEP_OPTIONS.threshold, STEP_THRESHOLDS.medium);
});

console.log(`\n${passed} checks passed`);
