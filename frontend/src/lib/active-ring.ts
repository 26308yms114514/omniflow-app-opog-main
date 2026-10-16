/**
 * "An alarm is ringing right now" state.
 *
 * The task screen is not allowed to be the owner of the siren. On Android the
 * back gesture is one swipe away, and if leaving `/task/:id` silenced the
 * alarm, the product's central rule — the siren keeps going until the task is
 * actually finished — would be trivially defeated.
 *
 * So the ring is recorded here, persisted, and owned by the scheduler:
 *   - leaving the task screen does not stop the sound;
 *   - the scheduler steers the user back to the task;
 *   - finishing the task ends the ring.
 *
 * Persisted so that reloading the page is not an escape hatch either.
 */
import { readStored, writeStored } from './local-store';

export interface ActiveRing {
  alarmId: string;
  startedAt: number;
  expiresAt: number;
  /**
   * Extra difficulty for this ring, as a percentage. Non-zero after a snooze,
   * so the task that finally silences the alarm is harder than the first one.
   */
  boostPercent?: number;
}

export const ACTIVE_RING_KEY = 'active_ring_v1';

/**
 * Safety valve. A ring that nobody can clear (a bug, a task the user cannot
 * physically complete, a phone left in a drawer) must not trap the app
 * forever, so it gives up on its own.
 */
export const RING_TTL_MS = 15 * 60 * 1000;

export function readRing(): ActiveRing | null {
  const ring = readStored<ActiveRing | null>(ACTIVE_RING_KEY, null);
  if (!ring || typeof ring.alarmId !== 'string' || typeof ring.expiresAt !== 'number') {
    return null;
  }
  return ring;
}

export function isExpired(ring: ActiveRing, now: number = Date.now()): boolean {
  return ring.expiresAt <= now;
}

/** The ring that is currently in force, or null when none is / it has expired. */
export function getActiveRing(now: number = Date.now()): ActiveRing | null {
  const ring = readRing();
  if (!ring) return null;
  return isExpired(ring, now) ? null : ring;
}

export function startRing(
  alarmId: string,
  now: number = Date.now(),
  boostPercent: number = 0
): ActiveRing {
  const ring: ActiveRing = {
    alarmId,
    startedAt: now,
    expiresAt: now + RING_TTL_MS,
    boostPercent: Math.max(0, boostPercent),
  };
  writeStored(ACTIVE_RING_KEY, ring);
  return ring;
}

export function endRing(): void {
  writeStored(ACTIVE_RING_KEY, null);
}
