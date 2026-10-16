/**
 * Vibration alarm test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/vibration-alarm.test.ts
 *
 * `navigator.vibrate` is stubbed here: what matters is the pattern maths and
 * the loop that keeps the alarm going, not the phone's motor.
 */
import assert from 'node:assert/strict';
import {
  MAX_INTENSITY,
  MIN_INTENSITY,
  VibrationAlarm,
  clampIntensity,
  patternDuration,
  vibrationPattern,
} from './vibration-alarm';

// --- navigator stub -------------------------------------------------------
// Node 21+ already defines a read-only `navigator` global, so this needs
// defineProperty rather than assignment.
const calls: Array<number | number[]> = [];
/** Whether the platform accepts the call (a user can disable vibration). */
let accepted = true;

function installNavigator(hasVibrate: boolean, hasBeenActive = true) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value: {
      ...(hasVibrate
        ? {
            vibrate: (pattern: number | number[]) => {
              calls.push(pattern);
              return accepted;
            },
          }
        : {}),
      userActivation: { hasBeenActive },
    },
  });
}

installNavigator(true);

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  calls.length = 0;
  accepted = true;
  installNavigator(true);
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

async function main() {
  console.log('vibration-alarm');

  await check('a pattern alternates on and off and ends with a pause', () => {
    const pattern = vibrationPattern(1);
    assert.equal(pattern.length, 4);
    assert.ok(pattern.every(value => value > 0));
    // The trailing pause is the longest, so consecutive loops are separable.
    assert.ok(pattern[3] > pattern[1]);
  });

  await check('a stronger intensity buzzes longer and pauses less', () => {
    const gentle = vibrationPattern(0.5);
    const harsh = vibrationPattern(2);
    assert.ok(harsh[0] > gentle[0], `${harsh[0]} vs ${gentle[0]}`);
    assert.ok(harsh[1] < gentle[1], `${harsh[1]} vs ${gentle[1]}`);
    assert.ok(harsh[0] > 0 && harsh[1] >= 80);
  });

  await check('intensity is clamped and nonsense falls back to normal', () => {
    assert.equal(clampIntensity(99), MAX_INTENSITY);
    assert.equal(clampIntensity(-5), MIN_INTENSITY);
    assert.equal(clampIntensity(Number.NaN), 1);
    assert.equal(clampIntensity(1), 1);
  });

  await check('pattern duration sums the segments', () => {
    assert.equal(patternDuration([100, 200, 300, 400]), 1000);
    assert.equal(patternDuration([]), 0);
  });

  await check('starting issues the first pattern immediately', () => {
    const alarm = new VibrationAlarm();
    assert.equal(alarm.start(), true);
    assert.equal(calls.length, 1);
    alarm.stop();
  });

  await check('starting twice does not stack loops', () => {
    const alarm = new VibrationAlarm();
    alarm.start();
    const afterFirst = calls.length;
    assert.equal(alarm.start(), false);
    assert.equal(calls.length, afterFirst);
    alarm.stop();
  });

  await check('stopping cancels the vibration', () => {
    const alarm = new VibrationAlarm();
    alarm.start();
    alarm.stop();
    assert.equal(alarm.isRunning, false);
    // The last call is the explicit zero-length stop.
    assert.deepEqual(calls[calls.length - 1], 0);
  });

  await check('an unsupported platform reports so instead of pretending', () => {
    installNavigator(false);
    const alarm = new VibrationAlarm();
    assert.equal(alarm.isSupported, false);
    assert.equal(alarm.start(), false);
  });

  await check('a refused call is reported, not swallowed', () => {
    // The user has vibration switched off, or the page has no activation yet.
    accepted = false;
    const alarm = new VibrationAlarm();
    assert.equal(alarm.isSupported, true);
    assert.equal(alarm.start(), false);
    assert.equal(alarm.isRunning, false, 'a refused alarm must not claim to be running');
  });

  await check('an untouched frame is not even asked', () => {
    // Chrome blocks — and logs an error for — vibration before any user
    // interaction, so the call must not be made at all.
    installNavigator(true, false);
    const alarm = new VibrationAlarm();
    assert.equal(alarm.isSupported, true);
    assert.equal(alarm.isAllowed, false);
    assert.equal(alarm.start(), false);
    assert.equal(calls.length, 0, 'a blocked call was still issued');
  });

  await check('a frame with prior interaction is allowed', () => {
    installNavigator(true, true);
    const alarm = new VibrationAlarm();
    assert.equal(alarm.isAllowed, true);
    assert.equal(alarm.start(), true);
    alarm.stop();
  });

  await check('a browser without the activation flag is assumed allowed', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      writable: true,
      value: { vibrate: () => true },
    });
    const alarm = new VibrationAlarm();
    assert.equal(alarm.isAllowed, true);
  });

  await check('changing intensity while running re-issues the pattern', () => {
    const alarm = new VibrationAlarm();
    alarm.start();
    const before = calls.length;
    alarm.setIntensity(1.6);
    assert.ok(calls.length > before, 'no new pattern was issued');
    assert.equal(alarm.currentIntensity, 1.6);
    alarm.stop();
  });

  await check('changing intensity while stopped is just remembered', () => {
    const alarm = new VibrationAlarm();
    alarm.setIntensity(1.4);
    assert.equal(calls.length, 0);
    assert.equal(alarm.currentIntensity, 1.4);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
