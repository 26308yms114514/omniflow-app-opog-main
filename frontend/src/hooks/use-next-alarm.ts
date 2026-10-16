import { useEffect, useState } from 'react';
import type { Alarm } from '@/types/alarm';
import { nextAlarmAcross } from '@/lib/next-alarm';

export interface UpcomingAlarm {
  alarm: Alarm;
  at: Date;
}

/**
 * The soonest alarm that has not rung yet, refreshed on an interval so the
 * countdown on screen stays honest.
 */
export function useNextAlarm(alarms: Alarm[], tickMs = 30_000): UpcomingAlarm | null {
  const [next, setNext] = useState<UpcomingAlarm | null>(() =>
    nextAlarmAcross(alarms, new Date())
  );

  useEffect(() => {
    const update = () => setNext(nextAlarmAcross(alarms, new Date()));
    update();
    const timer = window.setInterval(update, tickMs);
    return () => window.clearInterval(timer);
  }, [alarms, tickMs]);

  return next;
}
