// The Work Tracker's service worker (registered by components/team/
// push-toggle.tsx): it shows a push from lib/team/push.ts, and a tap opens the
// tracker, where the pop-up says the rest. Nothing else — no offline caching.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not one of ours: still say something, as a push must.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'D3', {
      body: data.body || '',
      tag: data.tag,
      // A newer push about the same thing buzzes again, not silently.
      renotify: Boolean(data.tag),
      icon: '/icon.png',
      data: { path: typeof data.path === 'string' ? data.path : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const home = self.location.origin + '/';
  let target = home;
  try {
    const url = new URL(event.notification.data.path, self.location.origin);
    // Only ever this host.
    if (url.origin === self.location.origin) target = url.href;
  } catch {
    // A bad path: the tracker's home.
  }
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      const tab = tabs.find((c) => c.url.startsWith(self.location.origin));
      if (!tab) return self.clients.openWindow(target);
      await tab.focus();
      // A tab this worker controls can be sent to the tracker; any other
      // still re-reads its page once it is in front.
      if (tab.url !== target && 'navigate' in tab)
        await tab.navigate(target).catch(() => undefined);
    })(),
  );
});
