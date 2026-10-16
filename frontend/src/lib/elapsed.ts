/**
 * How long a wake-up session took, in whole seconds.
 *
 * One function because the number was derived in four places — the live timer,
 * the completion screen and twice on the stats page — and because the live
 * timer accumulated ticks from a `setInterval`. Android throttles a backgrounded
 * tab's timers, so the on-screen clock fell behind reality the moment the user
 * took a phone call, while the completion screen (which already read the clock)
 * disagreed with it. Deriving both from timestamps keeps them consistent.
 *
 * A clock that jumps backwards (an NTP correction, a timezone change) yields 0
 * rather than a negative duration.
 */
export function elapsedSecondsSince(
  startedAt: number,
  endedAt: number = Date.now()
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return 0;
  const seconds = Math.floor((endedAt - startedAt) / 1000);
  return seconds > 0 ? seconds : 0;
}

/** "12秒" / "3分05秒" — a duration as the user should read it. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  if (safe < 60) return `${safe}秒`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`;
}
