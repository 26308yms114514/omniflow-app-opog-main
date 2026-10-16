/**
 * Session duration test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/elapsed.test.ts
 *
 * The live timer used to add one second per interval tick, which stops when
 * Android throttles a backgrounded tab. These pin the clock-derived behaviour,
 * including a clock that moves backwards.
 */
import assert from 'node:assert/strict';
import { elapsedSecondsSince, formatDuration } from './elapsed';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const T0 = 1_800_000_000_000;

console.log('elapsed');

check('whole seconds since the start', () => {
  assert.equal(elapsedSecondsSince(T0, T0 + 5_000), 5);
  assert.equal(elapsedSecondsSince(T0, T0 + 65_400), 65);
});

check('sub-second time is zero, not one', () => {
  assert.equal(elapsedSecondsSince(T0, T0 + 999), 0);
  assert.equal(elapsedSecondsSince(T0, T0), 0);
});

check('a clock that jumps backwards yields zero, never a negative', () => {
  // An NTP correction or timezone change must not print "-37秒".
  assert.equal(elapsedSecondsSince(T0, T0 - 37_000), 0);
});

check('nonsense timestamps yield zero', () => {
  assert.equal(elapsedSecondsSince(Number.NaN, T0), 0);
  assert.equal(elapsedSecondsSince(T0, Number.NaN), 0);
  assert.equal(elapsedSecondsSince(Number.POSITIVE_INFINITY, T0), 0);
});

check('it is not affected by how long the tab was throttled', () => {
  // The old implementation counted ticks, so a throttled tab under-reported.
  const throttled = T0 + 10 * 60_000;
  assert.equal(elapsedSecondsSince(T0, throttled), 600);
});

check('durations under a minute read as seconds', () => {
  assert.equal(formatDuration(0), '0秒');
  assert.equal(formatDuration(9), '9秒');
  assert.equal(formatDuration(59), '59秒');
});

check('longer durations read as minutes and seconds', () => {
  assert.equal(formatDuration(60), '1分00秒');
  assert.equal(formatDuration(65), '1分05秒');
  assert.equal(formatDuration(3_600), '60分00秒');
});

check('formatting never produces NaN', () => {
  assert.equal(formatDuration(Number.NaN), '0秒');
  assert.equal(formatDuration(-5), '0秒');
  assert.equal(formatDuration(12.7), '12秒');
});

console.log(`\n${passed} checks passed`);
