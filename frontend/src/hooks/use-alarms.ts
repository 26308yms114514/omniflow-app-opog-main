import { useState, useCallback, useMemo } from 'react';
import { useLocalStorage } from './use-localStorage';
import {
  Alarm,
  AlarmSession,
  DEFAULT_CONFIG,
  DEFAULT_REPEAT,
  normalizeAlarm,
} from '../types/alarm';

export function useAlarms() {
  const [storedAlarms, setAlarms] = useLocalStorage<Alarm[]>('alarms_v1', []);
  const [sessions, setSessions] = useLocalStorage<AlarmSession[]>('sessions_v1', []);

  // Alarms persisted by an older build may name a task type that no longer
  // exists; normalise on read so the editor and the task screen never see one.
  const alarms = useMemo(() => storedAlarms.map(normalizeAlarm), [storedAlarms]);

  const addAlarm = useCallback((partial: Partial<Alarm> = {}) => {
    const now = Date.now();
    const alarm: Alarm = {
      id: now.toString(),
      label: '',
      hour: 7,
      minute: 0,
      repeat: { ...DEFAULT_REPEAT },
      enabled: true,
      config: { ...DEFAULT_CONFIG },
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    setAlarms(prev => [...prev, alarm]);
    return alarm;
  }, [setAlarms]);

  const updateAlarm = useCallback((id: string, updates: Partial<Alarm>) => {
    // Stamp the edit so that changing an alarm to a time which has just passed
    // schedules it for tomorrow instead of firing the instant it is saved.
    const updatedAt = Date.now();
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, ...updates, updatedAt } : a));
  }, [setAlarms]);

  const deleteAlarm = useCallback((id: string) => {
    setAlarms(prev => prev.filter(a => a.id !== id));
  }, [setAlarms]);

  const toggleAlarm = useCallback((id: string) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
  }, [setAlarms]);

  const addSession = useCallback((session: AlarmSession) => {
    setSessions(prev => [session, ...prev].slice(0, 200));
  }, [setSessions]);

  return { alarms, sessions, addAlarm, updateAlarm, deleteAlarm, toggleAlarm, addSession };
}
