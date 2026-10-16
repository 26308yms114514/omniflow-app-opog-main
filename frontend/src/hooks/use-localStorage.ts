import { useEffect, useState } from 'react';
import { readStored, subscribeStored, writeStored } from '@/lib/local-store';

/**
 * `useState` persisted to localStorage.
 *
 * State is kept in sync both with other tabs (native `storage` event) and with
 * other components in this tab (see lib/local-store). The second half matters:
 * the alarm scheduler stays mounted for the whole session, so without it a
 * newly created alarm would never be observed by it.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() =>
    readStored(key, initialValue)
  );

  // Return a wrapped version of useState's setter that also persists the value
  const setValue = (value: T | ((val: T) => T)) => {
    // Allow value to be a function so we have the same API as useState
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    writeStored(key, valueToStore);
  };

  useEffect(() => {
    const resync = () => setStoredValue(readStored(key, initialValue));

    const unsubscribe = subscribeStored(key, resync);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) resync();
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
    };
    // `initialValue` is deliberately not a dependency: callers pass a fresh
    // literal each render, which would resubscribe on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [storedValue, setValue] as const;
}
