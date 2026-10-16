/**
 * Environment check rules test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/environment.test.ts
 *
 * The evaluator is pure, so every Android failure mode can be asserted here
 * without a device.
 */
import assert from 'node:assert/strict';
import {
  evaluateEnvironment,
  summarizeEnvironment,
  type EnvironmentProbes,
} from './environment';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** A phone where everything works. */
const healthy: EnvironmentProbes = {
  secureContext: true,
  deviceMotion: true,
  wakeLock: true,
  vibrate: true,
  notification: 'granted',
};

function find(id: string, probes: EnvironmentProbes) {
  const cap = evaluateEnvironment(probes).find(c => c.id === id);
  assert.ok(cap, `capability ${id} missing`);
  return cap!;
}

console.log('environment');

check('every capability is reported', () => {
  const ids = evaluateEnvironment(healthy).map(c => c.id);
  assert.deepEqual(ids, [
    'secure-context',
    'device-motion',
    'vibration',
    'notification',
    'wake-lock',
  ]);
});

check('a healthy phone passes everything', () => {
  const caps = evaluateEnvironment(healthy);
  assert.ok(caps.every(c => c.ok));
  const summary = summarizeEnvironment(caps);
  assert.equal(summary.ok, true);
  assert.equal(summary.total, caps.length);
  assert.deepEqual(summary.failing, []);
});

check('plain http is flagged as a critical failure', () => {
  const probes = { ...healthy, secureContext: false };
  const cap = find('secure-context', probes);
  assert.equal(cap.ok, false);
  assert.equal(cap.level, 'critical');
  assert.ok(cap.hint && cap.hint.includes('https'));
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, false);
});

check('a missing accelerometer is critical (the tasks would never advance)', () => {
  const probes = { ...healthy, deviceMotion: false };
  assert.equal(find('device-motion', probes).level, 'critical');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, false);
});

check('missing vibration is critical (the only alarm channel there is)', () => {
  const probes = { ...healthy, vibrate: false };
  assert.equal(find('vibration', probes).level, 'critical');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, false);
});

check('a denied notification is not critical', () => {
  const probes = { ...healthy, notification: 'denied' as const };
  const cap = find('notification', probes);
  assert.equal(cap.ok, false);
  assert.equal(cap.level, 'recommended');
  // Everything critical still passes, so the app is usable.
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, true);
});

check('an unauthorised notification says so rather than claiming denial', () => {
  assert.equal(find('notification', { ...healthy, notification: 'default' }).detail, '尚未授权');
  assert.equal(find('notification', { ...healthy, notification: 'denied' }).detail, '已被拒绝');
  assert.equal(
    find('notification', { ...healthy, notification: 'unsupported' }).detail,
    '浏览器不支持'
  );
});

check('a missing wake lock is only advisory', () => {
  const probes = { ...healthy, wakeLock: false };
  assert.equal(find('wake-lock', probes).level, 'recommended');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, true);
});

check('the summary lists precisely the failing capabilities', () => {
  const probes: EnvironmentProbes = {
    secureContext: false,
    deviceMotion: false,
    wakeLock: false,
    vibrate: false,
    notification: 'denied',
  };
  const summary = summarizeEnvironment(evaluateEnvironment(probes));
  assert.equal(summary.ok, false);
  assert.equal(summary.failing.length, 5);
});

console.log(`\n${passed} checks passed`);
