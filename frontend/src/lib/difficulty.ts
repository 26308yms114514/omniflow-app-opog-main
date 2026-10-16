/**
 * What the 难度档位 setting actually changes.
 *
 * Previously `config.difficulty` only highlighted a button in the editor and
 * was copied into the session record — picking 硬核 changed nothing about the
 * task. These profiles give it meaning without fighting the explicit duration
 * and step-count sliders the user already controls, so difficulty modulates
 * *how demanding the detection is*, not how long the task is:
 *
 *   - a stricter shake threshold makes lazy wobbling insufficient;
 *   - a stricter step threshold demands a real knee lift;
 *   - a shorter interrupt tolerance means pausing costs you the progress.
 *
 * Pure data plus two helpers, so the balance can be asserted in a test.
 */
import type { Difficulty } from '../types/alarm';

export interface DifficultyProfile {
  /** Multiplier on the shake detection threshold (higher = harder). */
  shakeThreshold: number;
  /** Multiplier on the step detection threshold (higher = harder). */
  stepThreshold: number;
  /** Multiplier on the interrupt tolerance (lower = harder). */
  tolerance: number;
}

export const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { shakeThreshold: 0.7, stepThreshold: 0.8, tolerance: 1.5 },
  medium: { shakeThreshold: 1, stepThreshold: 1, tolerance: 1 },
  hard: { shakeThreshold: 1.4, stepThreshold: 1.25, tolerance: 0.6 },
};

/** Short copy for the editor, so the choice is not a mystery. */
export const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: '动作更容易被识别，中断容忍更宽',
  medium: '标准灵敏度与中断容忍',
  hard: '动作判定更严，中断容忍更短，更容易清零',
};

export function getDifficultyProfile(difficulty: Difficulty | undefined): DifficultyProfile {
  return DIFFICULTY_PROFILES[difficulty ?? 'medium'] ?? DIFFICULTY_PROFILES.medium;
}

/** Shake threshold in m/s² for a base sensitivity threshold and a difficulty. */
export function effectiveShakeThreshold(
  base: number,
  difficulty: Difficulty | undefined
): number {
  return base * getDifficultyProfile(difficulty).shakeThreshold;
}

/** Step threshold in m/s² for a base sensitivity threshold and a difficulty. */
export function effectiveStepThreshold(
  base: number,
  difficulty: Difficulty | undefined
): number {
  return base * getDifficultyProfile(difficulty).stepThreshold;
}

/**
 * Seconds of stillness tolerated before the progress resets. Never below one
 * second: a tolerance of zero would fire instantly and make the alarm
 * impossible to satisfy.
 */
export function effectiveInterruptTolerance(
  base: number,
  difficulty: Difficulty | undefined
): number {
  const scaled = base * getDifficultyProfile(difficulty).tolerance;
  return Math.max(1, Math.round(scaled));
}
