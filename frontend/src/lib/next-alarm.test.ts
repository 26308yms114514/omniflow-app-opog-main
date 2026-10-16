/**
 * Scheduling rules test.
 *
 * There is no test runner in this project yet, so this file is a plain script
 * with assertions. Run it from the repository root with:
 *
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/next-alarm.test.ts
 *
 * Exits non-zero on the first failed assertion.
 */
import assert from 'node:assert/strict';
import {
  describeCountdown,
  dueAlarms,
  hasAnyRepeatDay,
  nextAlarmAcross,
  nextOccurrence,
  occurrenceOn,
  repeatsOn,
  ringKey,
} from './next-alarm';
import type { Alarm, RepeatDays } from '../types/alarm';

const NO_DAYS: RepeatDays = {
  mon: false,
  tue: false,
  wed: false,
  thu: false,
  fri: false,
  sat: false,
  sun: false,
};

function makeAlarm(overrides: Partial<Alarm> = {}): Alarm {
  return {
    id: 'a1',
    label: 'test',
    hour: 7,
    minute: 0,
    repeat: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    enabled: true,
    config: {
      taskType: 'shake',
      difficulty: 'easy',
      duration: 30,
      count: 10,
      interruptTolerance: 3,
      sensitivity: 'medium',
      snoozeEnabled: false,
      snoozeDifficultyBoost: 10,
    },
    createdAt: 0,
    ...overrides,
  };
}

const at = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min, 0, 0);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log('next-alarm');

check('disabled alarm never rings', () => {
  const from = at(2026, 10, 16, 6, 0);
  assert.equal(nextOccurrence(makeAlarm({ enabled: false }), from), null);
});

check('later today when the time is still ahead', () => {
  // Friday 2026-10-16, 06:00 -> same day 07:00 (Friday is a repeat day).
  const from = at(2026, 10, 16, 6, 0);
  const next = nextOccurrence(makeAlarm(), from);
  assert.deepEqual(next, at(2026, 10, 16, 7, 0));
});

check('rolls to the next repeat day once the time has passed', () => {
  // Friday 08:00, alarm 07:00 -> Monday 07:00 (weekends off).
  const from = at(2026, 10, 16, 8, 0);
  const next = nextOccurrence(makeAlarm(), from);
  assert.deepEqual(next, at(2026, 10, 19, 7, 0));
});

check('weekend alarm fires on Saturday', () => {
  const alarm = makeAlarm({
    repeat: { mon: false, tue: false, wed: false, thu: false, fri: false, sat: true, sun: true },
  });
  const from = at(2026, 10, 16, 8, 0); // Friday
  assert.deepEqual(nextOccurrence(alarm, from), at(2026, 10, 17, 7, 0));
});

check('an alarm with no repeat days falls back to daily', () => {
  const alarm = makeAlarm({ repeat: NO_DAYS });
  assert.equal(hasAnyRepeatDay(alarm), false);
  const from = at(2026, 10, 16, 8, 0);
  assert.deepEqual(nextOccurrence(alarm, from), at(2026, 10, 17, 7, 0));
});

check('exactly at the alarm time counts as already past', () => {
  const from = at(2026, 10, 16, 7, 0);
  assert.deepEqual(nextOccurrence(makeAlarm(), from), at(2026, 10, 19, 7, 0));
});

check('repeatsOn matches the weekday key', () => {
  const alarm = makeAlarm();
  assert.equal(repeatsOn(alarm, at(2026, 10, 16, 0, 0)), true); // Friday
  assert.equal(repeatsOn(alarm, at(2026, 10, 17, 0, 0)), false); // Saturday
});

check('nextAlarmAcross picks the soonest alarm', () => {
  const from = at(2026, 10, 16, 6, 0);
  const late = makeAlarm({ id: 'late', hour: 9 });
  const soon = makeAlarm({ id: 'soon', hour: 6, minute: 30 });
  const picked = nextAlarmAcross([late, soon], from);
  assert.equal(picked?.alarm.id, 'soon');
  assert.deepEqual(picked?.at, at(2026, 10, 16, 6, 30));
});

check('nextAlarmAcross ignores disabled alarms', () => {
  const from = at(2026, 10, 16, 6, 0);
  const picked = nextAlarmAcross([makeAlarm({ enabled: false })], from);
  assert.equal(picked, null);
});

check('ringKey is stable within a minute and unique across minutes', () => {
  const alarm = makeAlarm();
  const a = ringKey(alarm, at(2026, 10, 16, 7, 0));
  const b = ringKey(alarm, new Date(2026, 9, 16, 7, 0, 42));
  const c = ringKey(alarm, at(2026, 10, 16, 7, 1));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

check('countdown wording', () => {
  assert.equal(describeCountdown(30 * 1000), '不到 1 分钟');
  assert.equal(describeCountdown(5 * 60 * 1000), '还有 5 分钟');
  assert.equal(describeCountdown(2 * 3600 * 1000 + 5 * 60 * 1000), '还有 2 小时 5 分钟');
  assert.equal(describeCountdown(25 * 3600 * 1000), '还有 1 天 1 小时');
  assert.equal(describeCountdown(-1), '即将响铃');
});

check('occurrenceOn pins the alarm time to a calendar day', () => {
  assert.deepEqual(occurrenceOn(makeAlarm(), at(2026, 10, 16, 23, 59)), at(2026, 10, 16, 7, 0));
});

const FIVE_MIN = 5 * 60 * 1000;

check('dueAlarms fires inside the catch-up window', () => {
  const now = at(2026, 10, 16, 7, 2); // Friday, two minutes late
  assert.deepEqual(dueAlarms([makeAlarm()], now, FIVE_MIN).map(a => a.id), ['a1']);
});

check('dueAlarms stays quiet before the scheduled time', () => {
  const now = at(2026, 10, 16, 6, 59);
  assert.deepEqual(dueAlarms([makeAlarm()], now, FIVE_MIN), []);
});

check('dueAlarms lets a stale alarm expire', () => {
  const now = at(2026, 10, 16, 7, 6); // six minutes late
  assert.deepEqual(dueAlarms([makeAlarm()], now, FIVE_MIN), []);
});

check('dueAlarms respects the weekday set', () => {
  const now = at(2026, 10, 17, 7, 1); // Saturday, weekdays-only alarm
  assert.deepEqual(dueAlarms([makeAlarm()], now, FIVE_MIN), []);
});

check('dueAlarms skips disabled alarms', () => {
  const now = at(2026, 10, 16, 7, 1);
  assert.deepEqual(dueAlarms([makeAlarm({ enabled: false })], now, FIVE_MIN), []);
});

check('dueAlarms can return several alarms at once', () => {
  const now = at(2026, 10, 16, 7, 1);
  const both = [makeAlarm({ id: 'x' }), makeAlarm({ id: 'y' })];
  assert.deepEqual(dueAlarms(both, now, FIVE_MIN).map(a => a.id), ['x', 'y']);
});

console.log(`\n${passed} checks passed`);
