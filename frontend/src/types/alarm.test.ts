/**
 * Task catalogue test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/types/alarm.test.ts
 *
 * Locks in "only the two implemented tasks are offered" and the downgrade path
 * for alarms saved by an older build.
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  TASK_DESCRIPTIONS,
  TASK_ICONS,
  TASK_LABELS,
  TASK_TYPES,
  describeRepeat,
  formatClock,
  normalizeAlarm,
  normalizeTaskType,
} from './alarm';
import type { Alarm, RepeatDays } from './alarm';import { nextOccurrence } from '../lib/next-alarm';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function makeAlarm(taskType: unknown): Alarm {
  return {
    id: 'a1',
    label: '',
    hour: 7,
    minute: 0,
    repeat: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: false, sun: false },
    enabled: true,
    config: {
      taskType: taskType as Alarm['config']['taskType'],
      difficulty: 'easy',
      duration: 30,
      count: 10,
      interruptTolerance: 3,
      sensitivity: 'medium',
      snoozeEnabled: false,
      snoozeDifficultyBoost: 10,
    },
    createdAt: 0,
  };
}

console.log('alarm types');

check('exactly two tasks are offered', () => {
  assert.deepEqual(TASK_TYPES, ['shake', 'steps']);
});

check('the default difficulty is the neutral one', () => {
  // It used to be 'easy' while every `?? …` fallback in the app said 'medium',
  // so a freshly created alarm and a malformed one behaved differently.
  assert.equal(DEFAULT_CONFIG.difficulty, 'medium');
});

check('the default step target is not trivial', () => {
  // `count` used to mean squat reps; 10 steps is roughly five seconds of
  // marching, which would not wake anybody.
  assert.ok(DEFAULT_CONFIG.count >= 30, `count is ${DEFAULT_CONFIG.count}`);
});

check('the default shake duration is not trivial', () => {
  assert.ok(DEFAULT_CONFIG.duration >= 20, `duration is ${DEFAULT_CONFIG.duration}`);
});

check('the default interrupt tolerance leaves room to react', () => {
  assert.ok(DEFAULT_CONFIG.interruptTolerance >= 2, String(DEFAULT_CONFIG.interruptTolerance));
});

check('clock times are zero padded', () => {
  assert.equal(formatClock(7, 0), '07:00');
  assert.equal(formatClock(23, 59), '23:59');
  assert.equal(formatClock(0, 5), '00:05');
});

check('clock formatting never produces NaN', () => {
  // Stored data can be junk; the card must not print "NaN:NaN".
  assert.equal(formatClock(Number.NaN, Number.NaN), '00:00');
  assert.equal(formatClock(25, 70), '01:10');
  assert.equal(formatClock(-1, -1), '23:59');
});

check('every offered task has a label, icon and description', () => {
  for (const task of TASK_TYPES) {
    assert.equal(typeof TASK_LABELS[task], 'string');
    assert.ok(TASK_LABELS[task].length > 0, `${task} label missing`);
    assert.ok(TASK_ICONS[task].length > 0, `${task} icon missing`);
    assert.ok(TASK_DESCRIPTIONS[task].length > 0, `${task} description missing`);
  }
});

check('the catalogue carries no removed task types', () => {
  const removed = ['squat', 'qrcode', 'walk', 'nfc'];
  for (const task of removed) {
    assert.equal(task in TASK_LABELS, false, `${task} still in TASK_LABELS`);
    assert.equal(task in TASK_ICONS, false, `${task} still in TASK_ICONS`);
  }
});

check('normalizeTaskType keeps the supported values', () => {
  assert.equal(normalizeTaskType('shake'), 'shake');
  assert.equal(normalizeTaskType('steps'), 'steps');
});

check('normalizeTaskType downgrades anything else to shake', () => {
  for (const value of ['squat', 'qrcode', 'walk', 'nfc', '', null, undefined, 42, {}]) {
    assert.equal(normalizeTaskType(value), 'shake', `failed for ${String(value)}`);
  }
});

check('normalizeAlarm preserves identity when nothing changes', () => {
  const alarm = makeAlarm('steps');
  assert.equal(normalizeAlarm(alarm), alarm);
});

check('normalizeAlarm rewrites a removed task type', () => {
  const alarm = makeAlarm('NFC');
  const fixed = normalizeAlarm(alarm);
  assert.equal(fixed.config.taskType, 'shake');
  assert.notEqual(fixed, alarm);
  // Everything else must survive untouched.
  assert.equal(fixed.id, alarm.id);
  assert.equal(fixed.hour, alarm.hour);
  assert.equal(fixed.config.duration, alarm.config.duration);
});

check('normalizeAlarm tolerates a malformed config', () => {
  const broken = { id: 'x' } as unknown as Alarm;
  assert.doesNotThrow(() => normalizeAlarm(broken));
});

const days = (on: (keyof RepeatDays)[]) => {
  const base: RepeatDays = { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false };
  for (const day of on) base[day] = true;
  return base;
};

check('a full week reads as every day', () => {
  assert.equal(describeRepeat(days(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])), '每天');
});

check('an empty day set reads as every day, not once', () => {
  // The alarm list used to say 仅一次 here while the scheduler ran it daily.
  assert.equal(describeRepeat(days([])), '每天');
});

check('weekdays and weekends get their own wording', () => {
  assert.equal(describeRepeat(days(['mon', 'tue', 'wed', 'thu', 'fri'])), '工作日');
  assert.equal(describeRepeat(days(['sat', 'sun'])), '周末');
});

check('a mixed selection lists the days', () => {
  assert.equal(describeRepeat(days(['tue', 'thu'])), '每周 二 四');
  assert.equal(describeRepeat(days(['mon', 'sat'])), '每周 一 六');
});

check('the wording agrees with when the alarm actually rings', () => {
  // The card and the scheduler must never disagree about an empty day set.
  const empty = days([]);
  assert.equal(describeRepeat(empty), '每天');

  const alarm = { ...makeAlarm('shake'), repeat: empty };
  const friday = new Date(2026, 9, 16, 8, 0); // past 07:00
  // Daily means tomorrow, not "never" and not "only once".
  assert.deepEqual(nextOccurrence(alarm, friday), new Date(2026, 9, 17, 7, 0));
});

console.log(`\n${passed} checks passed`);
