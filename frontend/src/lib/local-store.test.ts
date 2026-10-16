/**
 * Storage sync test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/local-store.test.ts
 *
 * Covers the behaviour that makes the alarm scheduler notice alarms created on
 * another page: same-tab write notification.
 */
import assert from 'node:assert/strict';
import {
  clearStoredSubscribers,
  readStored,
  subscribeStored,
  writeStored,
} from './local-store';

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
  clearStoredSubscribers();
  store.clear();
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('local-store');

check('write then read round-trips a value', () => {
  writeStored('k', { a: 1, b: ['x'] });
  assert.deepEqual(readStored('k', null), { a: 1, b: ['x'] });
});

check('read falls back when the key is missing', () => {
  assert.equal(readStored('nope', 'fallback'), 'fallback');
});

check('read falls back on corrupt json', () => {
  store.set('broken', '{not json');
  assert.deepEqual(readStored('broken', []), []);
});

check('same-tab subscribers are notified', () => {
  let calls = 0;
  subscribeStored('alarms', () => {
    calls += 1;
  });
  writeStored('alarms', [1, 2]);
  assert.equal(calls, 1);
});

check('subscribers only hear about their own key', () => {
  let alarmsCalls = 0;
  let otherCalls = 0;
  subscribeStored('alarms', () => {
    alarmsCalls += 1;
  });
  subscribeStored('sessions', () => {
    otherCalls += 1;
  });
  writeStored('alarms', [1]);
  assert.equal(alarmsCalls, 1);
  assert.equal(otherCalls, 0);
});

check('several subscribers all fire', () => {
  let a = 0;
  let b = 0;
  subscribeStored('k', () => {
    a += 1;
  });
  subscribeStored('k', () => {
    b += 1;
  });
  writeStored('k', 1);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

check('unsubscribe stops notifications', () => {
  let calls = 0;
  const off = subscribeStored('k', () => {
    calls += 1;
  });
  writeStored('k', 1);
  off();
  writeStored('k', 2);
  assert.equal(calls, 1);
});

check('a subscriber sees the value written by another "component"', () => {
  // This mirrors the scheduler observing an alarm added on the edit page.
  let observed: unknown = null;
  subscribeStored('alarms_v1', () => {
    observed = readStored('alarms_v1', []);
  });
  writeStored('alarms_v1', [{ id: 'new-alarm', hour: 7, minute: 0 }]);
  assert.deepEqual(observed, [{ id: 'new-alarm', hour: 7, minute: 0 }]);
});

check('a throwing subscriber does not block the others', () => {
  let ok = 0;
  subscribeStored('k', () => {
    throw new Error('boom');
  });
  subscribeStored('k', () => {
    ok += 1;
  });
  writeStored('k', 1);
  assert.equal(ok, 1);
});

check('no window means silent no-op rather than a crash', () => {
  const saved = (globalThis as unknown as { window: unknown }).window;
  delete (globalThis as unknown as { window?: unknown }).window;
  try {
    assert.equal(readStored('k', 'fb'), 'fb');
    writeStored('k', 1);
  } finally {
    (globalThis as unknown as { window: unknown }).window = saved;
  }
});

console.log(`\n${passed} checks passed`);
