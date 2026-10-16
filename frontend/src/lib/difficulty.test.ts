/**
 * Difficulty profile test.
 *
 * Run from the repository root with:
 *   node node_modules/tsx/dist/cli.mjs frontend/src/lib/difficulty.test.ts
 *
 * These rules used to be dead code — the editor exposed 难度档位 while the
 * task behaved identically for every setting.
 */
import assert from 'node:assert/strict';
import {
  DIFFICULTY_HINTS,
  DIFFICULTY_PROFILES,
  effectiveInterruptTolerance,
  effectiveShakeThreshold,
  effectiveStepThreshold,
  getDifficultyProfile,
} from './difficulty';
import type { Difficulty } from '../types/alarm';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const ALL: Difficulty[] = ['easy', 'medium', 'hard'];

console.log('difficulty');

check('every difficulty has a profile and a hint', () => {
  for (const d of ALL) {
    assert.ok(DIFFICULTY_PROFILES[d], `${d} profile missing`);
    assert.ok(DIFFICULTY_HINTS[d]?.length > 0, `${d} hint missing`);
  }
});

check('medium is the neutral profile', () => {
  const p = getDifficultyProfile('medium');
  assert.equal(p.shakeThreshold, 1);
  assert.equal(p.stepThreshold, 1);
  assert.equal(p.tolerance, 1);
});

check('an unknown difficulty falls back to medium', () => {
  assert.deepEqual(getDifficultyProfile(undefined), DIFFICULTY_PROFILES.medium);
  assert.deepEqual(
    getDifficultyProfile('nonsense' as Difficulty),
    DIFFICULTY_PROFILES.medium
  );
});

check('harder settings raise the shake threshold', () => {
  const base = 15;
  const easy = effectiveShakeThreshold(base, 'easy');
  const medium = effectiveShakeThreshold(base, 'medium');
  const hard = effectiveShakeThreshold(base, 'hard');
  assert.ok(easy < medium, `${easy} should be < ${medium}`);
  assert.ok(hard > medium, `${hard} should be > ${medium}`);
  assert.equal(medium, base);
});

check('harder settings raise the step threshold too', () => {
  const base = 2.5;
  assert.ok(effectiveStepThreshold(base, 'easy') < base);
  assert.equal(effectiveStepThreshold(base, 'medium'), base);
  assert.ok(effectiveStepThreshold(base, 'hard') > base);
});

check('the step threshold scales more gently than the shake one', () => {
  // Marching produces far less acceleration than a deliberate shake, so an
  // aggressive multiplier would make the task unsatisfiable.
  assert.ok(
    DIFFICULTY_PROFILES.hard.stepThreshold < DIFFICULTY_PROFILES.hard.shakeThreshold
  );
});

check('harder settings shorten the interrupt tolerance', () => {
  const base = 4;
  assert.equal(effectiveInterruptTolerance(base, 'medium'), 4);
  assert.ok(effectiveInterruptTolerance(base, 'easy') > 4);
  assert.ok(effectiveInterruptTolerance(base, 'hard') < 4);
});

check('tolerance never drops below one second', () => {
  assert.equal(effectiveInterruptTolerance(1, 'hard'), 1);
  assert.equal(effectiveInterruptTolerance(0.5, 'hard'), 1);
  assert.equal(effectiveInterruptTolerance(0, 'hard'), 1);
});

check('tolerance is always a whole number of seconds', () => {
  for (const d of ALL) {
    const value = effectiveInterruptTolerance(3, d);
    assert.equal(Number.isInteger(value), true, `${d} produced ${value}`);
  }
});

check('honouring the configured tolerance by default', () => {
  // Medium must not silently rewrite what the slider says.
  for (const base of [1, 2, 3, 5, 10]) {
    assert.equal(effectiveInterruptTolerance(base, 'medium'), base);
  }
});

console.log(`\n${passed} checks passed`);
