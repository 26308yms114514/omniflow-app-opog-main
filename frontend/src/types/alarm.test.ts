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
  TASK_DESCRIPTIONS,
  TASK_ICONS,
  TASK_LABELS,
  TASK_TYPES,
  normalizeAlarm,
  normalizeTaskType,
} from './alarm';
import type { Alarm } from './alarm';

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

console.log(`\n${passed} checks passed`);
