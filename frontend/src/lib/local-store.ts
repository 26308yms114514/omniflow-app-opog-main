/**
 * localStorage read/write with same-tab change notification.
 *
 * Why this exists: the native `storage` event only fires in *other* documents.
 * Components that stay mounted for the life of the app — most importantly the
 * alarm scheduler — would therefore never see an alarm created on another page
 * of the same tab, and the new alarm would silently never ring.
 *
 * `window` is only touched inside functions, so the module is importable in a
 * bare Node test with a stubbed global.
 */

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WindowLike {
  localStorage: StorageLike;
}

/** Same-tab subscribers, grouped by storage key. */
const listeners = new Map<string, Set<() => void>>();

function getStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as WindowLike).localStorage ?? null;
}

/** Parse a stored value, falling back when it is missing or corrupt. */
export function readStored<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Persist a value and notify same-tab subscribers of that key. */
export function writeStored<T>(key: string, value: T): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded / private mode: keep the in-memory state usable.
    return;
  }
  notify(key);
}

function notify(key: string): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of Array.from(set)) {
    try {
      listener();
    } catch {
      // A broken subscriber must not stop the others.
    }
  }
}

/** Re-read `key` whenever it is written in this tab. Returns an unsubscribe. */
export function subscribeStored(key: string, onChange: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(onChange);
  return () => {
    const current = listeners.get(key);
    if (!current) return;
    current.delete(onChange);
    if (current.size === 0) listeners.delete(key);
  };
}

/** Test helper: drop every subscriber. */
export function clearStoredSubscribers(): void {
  listeners.clear();
}
