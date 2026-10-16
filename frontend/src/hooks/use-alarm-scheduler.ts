import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAlarms } from './use-alarms';
import type { Alarm } from '@/types/alarm';
import { formatClock } from '@/types/alarm';
import { dueAlarms, occurrenceOn, ringKey } from '@/lib/next-alarm';
import { getAlarmSound } from '@/lib/alarm-sound';
import { vibrate } from '@/lib/motion';
import {
  endRing,
  getActiveRing,
  isExpired,
  readRing,
  startRing,
} from '@/lib/active-ring';
import {
  ensureServiceWorker,
  notificationPermission,
  requestNotificationPermission,
  showAlarmNotification,
} from '@/lib/notify';
import { clearSnooze, isDue, readSnooze } from '@/lib/snooze';

/** How often the schedule is re-checked while the app is open. */
const TICK_MS = 15_000;

/**
 * How late an alarm may still fire. A backgrounded Android tab has its timers
 * throttled to roughly one per minute, so some slack is required; the window
 * also decides how stale an alarm may be before the app assumes you already
 * got up.
 */
const CATCHUP_MS = 5 * 60_000;

function formatTime(alarm: Alarm): string {
  return formatClock(alarm.hour, alarm.minute);
}

/**
 * Watches the wall clock and launches the wake-up task when an alarm is due.
 *
 * Must be rendered inside the router: it navigates to `/task/:id`.
 *
 * This hook — not the task screen — owns the siren once an alarm is ringing.
 * That is deliberate: on Android the back gesture is one swipe away, and a task
 * screen that silenced the alarm when it unmounted would make the whole
 * "the ringing does not stop until you finish" rule trivial to defeat.
 *
 * Browser limits this design works within, rather than pretending otherwise:
 *   - the page has to be open (a web app cannot wake a sleeping phone from
 *     cold), so this fires while the app is foregrounded or in a recently
 *     backgrounded tab;
 *   - audio needs a prior user gesture, which is why the first interaction
 *     anywhere unlocks the siren;
 *   - notifications are the fallback channel when the siren is not permitted.
 */
export function useAlarmScheduler(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { alarms } = useAlarms();

  const alarmsRef = useRef(alarms);
  const pathRef = useRef(location.pathname);
  /** Ring timestamps keyed by alarm + scheduled minute, to fire exactly once. */
  const firedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  useEffect(() => {
    pathRef.current = location.pathname;

    // Pull the user straight back if they leave a ringing task, rather than
    // waiting up to TICK_MS for the next scheduled check.
    const ring = getActiveRing();
    if (!ring) return;
    const target = `/task/${ring.alarmId}`;
    if (location.pathname === target) return;

    // The alarm may have been deleted while it was ringing; never chase a ghost.
    if (!alarmsRef.current.some(a => a.id === ring.alarmId)) {
      endRing();
      getAlarmSound().stop();
      return;
    }

    navigate(target);
  }, [location.pathname, navigate]);

  // Unlock audio (and ask for notification permission) on the very first user
  // gesture, so an alarm hours later is still allowed to make noise.
  useEffect(() => {
    let handled = false;

    const onFirstGesture = async () => {
      if (handled) return;
      handled = true;
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);

      await ensureServiceWorker();
      await getAlarmSound().unlock();

      const hasEnabledAlarm = alarmsRef.current.some(a => a.enabled);
      if (hasEnabledAlarm && notificationPermission() === 'default') {
        await requestNotificationPermission();
      }
    };

    window.addEventListener('pointerdown', onFirstGesture);
    window.addEventListener('keydown', onFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', onFirstGesture);
      window.removeEventListener('keydown', onFirstGesture);
    };
  }, []);

  useEffect(() => {
    const beginRing = async (alarm: Alarm, boostPercent = 0) => {
      startRing(alarm.id, Date.now(), boostPercent);

      // Sound first: if navigation is somehow blocked the alarm still rings.
      const sound = getAlarmSound();
      if (await sound.unlock()) sound.start();
      vibrate([300, 150, 300, 150, 300]);

      void showAlarmNotification(
        `${formatTime(alarm)} 强制清醒`,
        alarm.label
          ? `${alarm.label} · 完成动作任务才能关闭铃声`
          : '起床时间到了，完成动作任务才能关闭铃声',
        `alarm-${alarm.id}`,
        `#/task/${alarm.id}`
      );

      const target = `/task/${alarm.id}`;
      if (pathRef.current !== target) navigate(target);
    };

    /**
     * Keep an in-force ring alive: re-route the user back to the task if they
     * navigated away, make sure the siren is actually sounding (this is what
     * restores it after a reload), and retire the ring when it times out.
     */
    const enforceRing = async (now: Date) => {
      const ring = readRing();
      if (!ring) return;

      if (isExpired(ring, now.getTime())) {
        endRing();
        getAlarmSound().stop();
        return;
      }

      // A ring whose alarm was deleted can never be satisfied: release it,
      // otherwise the user is trapped on a task screen that says 闹钟不存在.
      if (!alarmsRef.current.some(a => a.id === ring.alarmId)) {
        endRing();
        getAlarmSound().stop();
        return;
      }

      const target = `/task/${ring.alarmId}`;
      if (pathRef.current !== target) navigate(target);

      const sound = getAlarmSound();
      if (!sound.isRunning && (await sound.unlock())) sound.start();
    };

    const check = () => {
      const now = new Date();

      // One alarm at a time: while something is ringing, that ring is the only
      // thing this hook manages.
      if (getActiveRing(now.getTime())) {
        void enforceRing(now);
        return;
      }

      // A snoozed alarm takes priority over the regular schedule: it is a
      // deliberate postponement the user just asked for.
      const snooze = readSnooze();
      if (snooze && isDue(snooze, now.getTime())) {
        clearSnooze();
        const alarm = alarmsRef.current.find(a => a.id === snooze.alarmId);
        // The alarm may have been deleted or switched off while snoozed.
        if (alarm && alarm.enabled) {
          firedRef.current.set(ringKey(alarm, occurrenceOn(alarm, now)), now.getTime());
          void beginRing(alarm, snooze.boostPercent);
          return;
        }
      }

      const due = dueAlarms(alarmsRef.current, now, CATCHUP_MS);
      if (!due.length) return;

      // Keep the dedupe map from growing without bound over long sessions.
      if (firedRef.current.size > 200) firedRef.current.clear();

      for (const alarm of due) {
        // Key off the *scheduled* minute, not the current one: otherwise an
        // alarm that fires three minutes late would ring again on the next
        // tick, once per minute, for the whole catch-up window.
        const key = ringKey(alarm, occurrenceOn(alarm, now));
        if (firedRef.current.has(key)) continue;
        firedRef.current.set(key, now.getTime());
        // A fresh ring starts from the alarm's own difficulty; any snooze
        // boost belonged to the previous postponement.
        void beginRing(alarm, 0);
      }
    };

    check();
    const timer = window.setInterval(check, TICK_MS);

    // A phone that was asleep delivers nothing; re-check the moment we are
    // visible again instead of waiting for the next tick.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [navigate]);
}
