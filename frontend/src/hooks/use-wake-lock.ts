import { useEffect, useRef } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

/**
 * Keeps the screen awake while `active` is true.
 *
 * This matters on Android: a phone that is lying on the bed will let the
 * screen time out within ~30s, and a backgrounded tab throttles timers, which
 * would silently freeze the whole wake-up task. The lock is dropped
 * automatically when the page is hidden and re-acquired when it returns.
 *
 * Requires a secure origin (https). Silently does nothing where unsupported.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const wakeLock = getWakeLock();
    if (!active || !wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        // The browser can revoke the lock on its own (battery saver, tab
        // switch). Clearing our ref lets the visibility handler re-acquire.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Denied (low battery, permissions policy, insecure origin).
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => {});
      }
    };
  }, [active]);
}
