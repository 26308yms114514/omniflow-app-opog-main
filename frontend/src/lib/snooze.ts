/**
 * Snooze ("贪睡模式") state.
 *
 * The editor has always exposed a snooze switch, and `snoozeEnabled` /
 * `snoozeDifficultyBoost` have always existed in the config — but nothing ever
 * read them, so toggling it did nothing. This gives the setting an effect:
 * postponing a ringing alarm by a few minutes, and making the next ring harder
 * by the configured percentage.
 *
 * Opt-in only (`snoozeEnabled` defaults to false), so the app's default
 * promise — the siren keeps going until the task is finished — is unchanged.
 */
import { readStored, writeStored } from './local-store';

export interface SnoozedAlarm {
  alarmId: string;
  /** Wall-clock time the alarm should ring again. */
  fireAt: number;
  /** Extra difficulty applied to the next ring, as a percentage. */
  boostPercent: number;
}

export const SNOOZE_KEY = 'snoozed_alarm_v1';

/** How long a snooze postpones the alarm. */
export const SNOOZE_MINUTES = 5;

/**
 * Upper bound on accumulated boost. Without a cap, a determined sleeper could
 * snooze the threshold into a range no amount of shaking can satisfy.
 */
export const MAX_BOOST_PERCENT = 200;

export function readSnooze(): SnoozedAlarm | null {
  const value = readStored<SnoozedAlarm | null>(SNOOZE_KEY, null);
  if (
    !value ||
    typeof value.alarmId !== 'string' ||
    typeof value.fireAt !== 'number' ||
    typeof value.boostPercent !== 'number'
  ) {
    return null;
  }
  return value;
}

/** Queue the next ring, stacking `extraBoostPercent` onto any previous boost. */
export function scheduleSnooze(
  alarmId: string,
  extraBoostPercent: number,
  now: number = Date.now(),
  minutes: number = SNOOZE_MINUTES
): SnoozedAlarm {
  const previous = readSnooze();
  const carried = previous && previous.alarmId === alarmId ? previous.boostPercent : 0;
  const snooze: SnoozedAlarm = {
    alarmId,
    fireAt: now + Math.max(1, minutes) * 60_000,
    boostPercent: Math.min(MAX_BOOST_PERCENT, carried + Math.max(0, extraBoostPercent)),
  };
  writeStored(SNOOZE_KEY, snooze);
  return snooze;
}

export function clearSnooze(): void {
  writeStored(SNOOZE_KEY, null);
}

export function isDue(snooze: SnoozedAlarm, now: number = Date.now()): boolean {
  return snooze.fireAt <= now;
}

/** Milliseconds until the alarm rings again, never negative. */
export function remainingMs(snooze: SnoozedAlarm, now: number = Date.now()): number {
  return Math.max(0, snooze.fireAt - now);
}

/**
 * Difficulty multiplier from an accumulated snooze boost.
 * 100% boost means double the threshold (i.e. twice as hard to satisfy).
 */
export function boostMultiplier(boostPercent: number): number {
  return 1 + Math.max(0, boostPercent) / 100;
}
