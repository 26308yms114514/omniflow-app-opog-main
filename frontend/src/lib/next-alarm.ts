/**
 * Pure scheduling maths: when does an alarm next ring?
 *
 * Kept free of React and browser APIs so the rules are easy to reason about
 * and can be exercised directly in a test.
 */
import type { Alarm, RepeatDays } from '../types/alarm';

/** Indexed by `Date#getDay()` (0 = Sunday). */
const WEEKDAY_KEYS: (keyof RepeatDays)[] = [
  'sun',
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
];

export function hasAnyRepeatDay(alarm: Alarm): boolean {
  return WEEKDAY_KEYS.some((key) => alarm.repeat[key] === true);
}

export function repeatsOn(alarm: Alarm, date: Date): boolean {
  return alarm.repeat[WEEKDAY_KEYS[date.getDay()]] === true;
}

/**
 * The first moment this alarm should ring strictly after `from`.
 *
 * Returns null when the alarm is disabled.
 *
 * A weekday set with every day switched off is treated as "every day" rather
 * than "never": the editor permits clearing all seven days, and silently
 * disabling the alarm there would be a worse surprise than ringing daily.
 */
export function nextOccurrence(alarm: Alarm, from: Date): Date | null {
  if (!alarm.enabled) return null;

  const repeats = hasAnyRepeatDay(alarm);

  // Today plus the next seven days always contains a match.
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(
      from.getFullYear(),
      from.getMonth(),
      from.getDate() + offset,
      alarm.hour,
      alarm.minute,
      0,
      0
    );
    if (candidate.getTime() <= from.getTime()) continue;
    if (!repeats || repeatsOn(alarm, candidate)) return candidate;
  }

  return null;
}

/** The soonest upcoming ring across every alarm. */
export function nextAlarmAcross(
  alarms: Alarm[],
  from: Date
): { alarm: Alarm; at: Date } | null {
  let best: { alarm: Alarm; at: Date } | null = null;
  for (const alarm of alarms) {
    const at = nextOccurrence(alarm, from);
    if (!at) continue;
    if (!best || at.getTime() < best.at.getTime()) best = { alarm, at };
  }
  return best;
}

/** The moment this alarm is scheduled for on `date`'s calendar day. */
export function occurrenceOn(alarm: Alarm, date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    alarm.hour,
    alarm.minute,
    0,
    0
  );
}

/**
 * Alarms whose scheduled time has arrived within the last `windowMs`.
 *
 * A window (rather than an exact match) is needed because a backgrounded
 * Android tab has its timers throttled to roughly once a minute, and a phone
 * that was asleep may deliver the check late. The window also decides how
 * stale an alarm may be and still ring: open the app six minutes late and it
 * stays quiet.
 */
export function dueAlarms(
  alarms: Alarm[],
  now: Date,
  windowMs: number
): Alarm[] {
  const due: Alarm[] = [];
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    const repeats = hasAnyRepeatDay(alarm);
    if (repeats && !repeatsOn(alarm, now)) continue;
    const elapsed = now.getTime() - occurrenceOn(alarm, now).getTime();
    if (elapsed < 0 || elapsed > windowMs) continue;
    due.push(alarm);
  }
  return due;
}

/**
 * Minute-resolution key used to make sure a given alarm rings at most once per
 * minute, even though the scheduler re-checks on an interval and after the tab
 * has been throttled in the background.
 */
export function ringKey(alarm: Alarm, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    alarm.id,
    at.getFullYear(),
    pad(at.getMonth() + 1),
    pad(at.getDate()),
    pad(at.getHours()),
    pad(at.getMinutes()),
  ].join('-');
}

/**
 * Human-readable countdown used by the UI ("还有 7 小时 12 分钟").
 */
export function describeCountdown(ms: number): string {
  if (ms <= 0) return '即将响铃';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `还有 ${days} 天 ${hours} 小时`;
  if (hours > 0) return `还有 ${hours} 小时 ${minutes} 分钟`;
  if (minutes > 0) return `还有 ${minutes} 分钟`;
  return '不到 1 分钟';
}
