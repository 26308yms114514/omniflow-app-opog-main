/**
 * Snooze test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/snooze.test.ts
 *
 * The snooze switch in the editor used to be inert; these assertions pin the
 * behaviour of the state it now drives.
 */
import assert from 'node:assert/strict';
import {
  MAX_BOOST_PERCENT,
  SNOOZE_KEY,
  SNOOZE_MINUTES,
  boostMultiplier,
  clearSnooze,
  isDue,
  readSnooze,
  remainingMs,
  scheduleSnooze,
} from './snooze';

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  },
};

let passed = 0;
function check(name: string, fn: () => void) {
  store.clear();
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const T0 = 1_800_000_000_000;

console.log('snooze');

check('nothing is snoozed initially', () => {
  assert.equal(readSnooze(), null);
});

check('scheduling sets a fire time five minutes out', () => {
  const snooze = scheduleSnooze('alarm-1', 10, T0);
  assert.equal(snooze.alarmId, 'alarm-1');
  assert.equal(snooze.fireAt, T0 + SNOOZE_MINUTES * 60_000);
  assert.equal(snooze.boostPercent, 10);
  assert.deepEqual(readSnooze(), snooze);
});

check('the snooze survives a reload (it is persisted)', () => {
  scheduleSnooze('alarm-1', 0, T0);
  assert.equal(JSON.parse(store.get(SNOOZE_KEY)!).alarmId, 'alarm-1');
  assert.equal(readSnooze()?.alarmId, 'alarm-1');
});

check('it is not due before the fire time and due after', () => {
  const snooze = scheduleSnooze('alarm-1', 0, T0);
  assert.equal(isDue(snooze, T0), false);
  assert.equal(isDue(snooze, T0 + SNOOZE_MINUTES * 60_000 - 1), false);
  assert.equal(isDue(snooze, T0 + SNOOZE_MINUTES * 60_000), true);
});

check('remaining time counts down and never goes negative', () => {
  const snooze = scheduleSnooze('alarm-1', 0, T0);
  assert.equal(remainingMs(snooze, T0), SNOOZE_MINUTES * 60_000);
  assert.equal(remainingMs(snooze, T0 + 60_000), (SNOOZE_MINUTES - 1) * 60_000);
  assert.equal(remainingMs(snooze, T0 + 60 * 60_000), 0);
});

check('snoozing the same alarm again stacks the boost', () => {
  scheduleSnooze('alarm-1', 10, T0);
  const second = scheduleSnooze('alarm-1', 10, T0 + 1000);
  assert.equal(second.boostPercent, 20);
});

check('snoozing a different alarm does not inherit the old boost', () => {
  scheduleSnooze('alarm-1', 50, T0);
  const other = scheduleSnooze('alarm-2', 10, T0 + 1000);
  assert.equal(other.boostPercent, 10);
});

check('the boost is capped so the task cannot become impossible', () => {
  scheduleSnooze('alarm-1', MAX_BOOST_PERCENT, T0);
  const again = scheduleSnooze('alarm-1', MAX_BOOST_PERCENT, T0 + 1000);
  assert.equal(again.boostPercent, MAX_BOOST_PERCENT);
});

check('a negative boost cannot lower difficulty', () => {
  const snooze = scheduleSnooze('alarm-1', -50, T0);
  assert.equal(snooze.boostPercent, 0);
});

check('clearing removes the snooze', () => {
  scheduleSnooze('alarm-1', 10, T0);
  clearSnooze();
  assert.equal(readSnooze(), null);
});

check('corrupt stored data is treated as no snooze', () => {
  store.set(SNOOZE_KEY, '{"alarmId":"x"}');
  assert.equal(readSnooze(), null);
  store.set(SNOOZE_KEY, 'garbage');
  assert.equal(readSnooze(), null);
});

check('boostMultiplier converts percent to a factor', () => {
  assert.equal(boostMultiplier(0), 1);
  assert.equal(boostMultiplier(50), 1.5);
  assert.equal(boostMultiplier(100), 2);
  assert.equal(boostMultiplier(-10), 1);
});

console.log(`\n${passed} checks passed`);
