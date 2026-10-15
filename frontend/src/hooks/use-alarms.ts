import { useState, useCallback } from 'react';
import { useLocalStorage } from './use-localStorage';
import { Alarm, AlarmSession, DEFAULT_CONFIG, DEFAULT_REPEAT } from '../types/alarm';

export function useAlarms() {
  const [alarms, setAlarms] = useLocalStorage<Alarm[]>('alarms_v1', []);
  const [sessions, setSessions] = useLocalStorage<AlarmSession[]>('sessions_v1', []);

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
      ...partial,
    };
    setAlarms(prev => [...prev, alarm]);
    return alarm;
  }, [setAlarms]);

  const updateAlarm = useCallback((id: string, updates: Partial<Alarm>) => {
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
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
