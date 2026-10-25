/*
 * Minimal service worker.
 *
 * Android Chrome refuses to construct `new Notification()` from a page and
 * demands `ServiceWorkerRegistration.showNotification()`, so this worker exists
 * purely to deliver the alarm notification and to focus the app when it is
 * tapped.
 *
 * Deliberately has NO fetch handler: nothing is cached, so a redeploy can
 * never leave a stale bundle running. Offline caching would be a separate,
 * carefully-versioned decision.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const target = data.url || './';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windows) {
        // Prefer an already-open window: the alarm task must not spawn a
        // second copy of the app.
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client && target) {
            try {
              await client.navigate(target);
            } catch {
              /* navigation can be refused for cross-origin targets */
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })()
  );
});
