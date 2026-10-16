import { useAlarmScheduler } from '@/hooks/use-alarm-scheduler';

/**
 * Mounts the alarm scheduler for the lifetime of the app. Renders nothing —
 * it only exists so the scheduler re-renders with the router context it needs
 * to navigate to `/task/:id` when an alarm comes due.
 */
export default function AlarmScheduler() {
  useAlarmScheduler();
  return null;
}
