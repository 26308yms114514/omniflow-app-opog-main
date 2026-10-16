/**
 * Active-ring test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/active-ring.test.ts
 *
 * Covers the persisted "an alarm is ringing" marker that stops the Android
 * back gesture from silencing the alarm.
 */
import assert from 'node:assert/strict';
import {
  ACTIVE_RING_KEY,
  RING_TTL_MS,
  endRing,
  getActiveRing,
  isExpired,
  readRing,
  startRing,
} from './active-ring';

// --- minimal localStorage stub -------------------------------------------
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

console.log('active-ring');

check('no ring initially', () => {
  assert.equal(getActiveRing(T0), null);
  assert.equal(readRing(), null);
});

check('starting a ring makes it active', () => {
  const ring = startRing('alarm-1', T0);
  assert.equal(ring.alarmId, 'alarm-1');
  assert.equal(ring.expiresAt, T0 + RING_TTL_MS);
  assert.deepEqual(getActiveRing(T0), ring);
});

check('the ring survives a reload (it is persisted)', () => {
  startRing('alarm-1', T0);
  // A fresh read straight from storage is what a reloaded page would do.
  const persisted = JSON.parse(store.get(ACTIVE_RING_KEY)!);
  assert.equal(persisted.alarmId, 'alarm-1');
  assert.equal(getActiveRing(T0 + 1000)?.alarmId, 'alarm-1');
});

check('an expired ring is not active', () => {
  const ring = startRing('alarm-1', T0);
  assert.equal(isExpired(ring, T0 + RING_TTL_MS - 1), false);
  assert.equal(isExpired(ring, T0 + RING_TTL_MS), true);
  assert.equal(getActiveRing(T0 + RING_TTL_MS), null);
  // The stale record is still readable, so the scheduler can spot that the
  // ring just lapsed and stop the siren deliberately.
  assert.equal(readRing()?.alarmId, 'alarm-1');
});

check('ending a ring clears it', () => {
  startRing('alarm-1', T0);
  endRing();
  assert.equal(getActiveRing(T0), null);
  assert.equal(readRing(), null);
});

check('a ring for a different alarm replaces the previous one', () => {
  startRing('alarm-1', T0);
  startRing('alarm-2', T0 + 10);
  assert.equal(getActiveRing(T0 + 20)?.alarmId, 'alarm-2');
});

check('corrupt stored data is treated as no ring', () => {
  store.set(ACTIVE_RING_KEY, '{"alarmId":42}');
  assert.equal(readRing(), null);
  assert.equal(getActiveRing(T0), null);
});

check('garbage json is treated as no ring', () => {
  store.set(ACTIVE_RING_KEY, 'not json at all');
  assert.equal(getActiveRing(T0), null);
});

check('a ring carries the snooze boost for the next task', () => {
  const plain = startRing('alarm-1', T0);
  assert.equal(plain.boostPercent, 0);

  const boosted = startRing('alarm-1', T0, 40);
  assert.equal(boosted.boostPercent, 40);
  assert.equal(getActiveRing(T0)?.boostPercent, 40);

  // A negative boost must not make the task easier than the first ring.
  assert.equal(startRing('alarm-1', T0, -5).boostPercent, 0);
});

console.log(`\n${passed} checks passed`);
