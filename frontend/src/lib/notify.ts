/**
 * Alarm notifications.
 *
 * Platform split this module hides:
 *   - Desktop Firefox/Safari accept `new Notification(...)` from a page.
 *   - Android Chrome throws on that constructor and requires
 *     `ServiceWorkerRegistration.showNotification(...)`.
 * So the service worker is always preferred and the constructor is only a
 * fallback. Everything degrades to a silent no-op where permission is denied.
 */

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * The single answer to "can this browser raise a notification?".
 *
 * The permission model lives on `window.Notification`, and a service worker
 * alone is not enough to show one — so `'Notification' in window` is the test.
 * A second `notificationsSupported()` helper used to exist beside this one and
 * disagreed with it (it accepted a service worker without the API); it was
 * never called, so it is gone rather than left as a trap.
 */
export function notificationPermission(): NotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotifyPermission;
}

/** Register (once) the notification service worker. */
export function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    // Registration only succeeds on a secure origin; on plain http this
    // rejects and we fall back to the page-level Notification constructor.
    try {
      return await navigator.serviceWorker.register('./sw.js');
    } catch {
      return null;
    }
  })();

  return registrationPromise;
}

/**
 * Ask for permission. Call from inside a user gesture — Chrome ignores
 * requests that are not user-initiated.
 */
export async function requestNotificationPermission(): Promise<NotifyPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission as NotifyPermission;
  }
  try {
    const result = await Notification.requestPermission();
    return result as NotifyPermission;
  } catch {
    return 'denied';
  }
}

/**
 * Show the alarm notification. Resolves true when it was actually displayed.
 * `url` is where a tap should land, relative to the app root.
 */
export async function showAlarmNotification(
  title: string,
  body: string,
  tag: string,
  url = './'
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const options: NotificationOptions = {
    body,
    tag,
    // Keeps the banner on screen until the user deals with it (desktop).
    requireInteraction: true,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url },
  };

  const registration = await ensureServiceWorker();
  if (registration) {
    try {
      await registration.showNotification(title, options);
      return true;
    } catch {
      // Fall through to the constructor.
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      // Not available on Android, but works on desktop browsers.
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
