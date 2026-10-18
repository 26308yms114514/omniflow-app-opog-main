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
  tone: true,
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
    'alarm-output',
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

check('losing both alarm channels is critical', () => {
  const probes = { ...healthy, vibrate: false, tone: false };
  assert.equal(find('alarm-output', probes).level, 'critical');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, false);
});

check('one working channel is enough, and the detail says which', () => {
  const both = find('alarm-output', healthy);
  assert.equal(both.ok, true);
  assert.equal(both.detail, '响铃 + 震动');

  const soundOnly = find('alarm-output', { ...healthy, vibrate: false });
  assert.equal(soundOnly.ok, true, 'sound alone still alarms');
  assert.ok(soundOnly.detail.includes('仅响铃'), soundOnly.detail);

  const buzzOnly = find('alarm-output', { ...healthy, tone: false });
  assert.equal(buzzOnly.ok, true, 'vibration alone still alarms');
  assert.ok(buzzOnly.detail.includes('仅震动'), buzzOnly.detail);
});

check('a denied notification is critical (the only channel on a locked phone)', () => {
  // The Vibration API forbids vibrating while the document is hidden, so with
  // the screen off a notification is all there is.
  const probes = { ...healthy, notification: 'denied' as const };
  const cap = find('notification', probes);
  assert.equal(cap.ok, false);
  assert.equal(cap.level, 'critical');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, false);
});

check('a browser without notifications is a limitation, not a failure', () => {
  // The user cannot fix this, and the alarm still works while the page is
  // open, so a permanent red cross would be both wrong and unactionable.
  const probes = { ...healthy, notification: 'unsupported' as const };
  const cap = find('notification', probes);
  assert.equal(cap.ok, false);
  assert.equal(cap.level, 'recommended');
  assert.equal(summarizeEnvironment(evaluateEnvironment(probes)).ok, true);
  assert.ok((cap.hint ?? '').includes('锁屏'), cap.hint);
});

check('the alarm-output hint warns about the locked screen', () => {
  const hint = find('alarm-output', healthy).hint ?? '';
  assert.ok(hint.includes('锁屏'), hint);
});

check('an unauthorised notification says so rather than claiming denial', () => {
  assert.equal(find('notification', { ...healthy, notification: 'default' }).detail, '尚未授权');
  assert.equal(find('notification', { ...healthy, notification: 'denied' }).detail, '已被拒绝');
  assert.equal(
    find('notification', { ...healthy, notification: 'unsupported' }).detail,
    '本浏览器不支持，只能靠响铃和震动'
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
    tone: false,
    notification: 'denied',
  };
  const summary = summarizeEnvironment(evaluateEnvironment(probes));
  assert.equal(summary.ok, false);
  assert.equal(summary.failing.length, 5);
});

console.log(`\n${passed} checks passed`);
