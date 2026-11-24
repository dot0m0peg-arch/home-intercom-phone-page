'use strict';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data.json(); } catch (_) { payload = {}; }
    let answerUrl = null;
    try {
      const candidate = new URL(payload.url);
      if (candidate.protocol === 'https:' && !candidate.username && !candidate.password) answerUrl = candidate.href;
    } catch (_) {}
    const expired = payload.expiresAt && Date.now() > Number(payload.expiresAt) * 1000;
    const canAnswer = !!answerUrl && !expired;
    const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.slice(0, 120) : 'Incoming family call';
    const body = typeof payload.body === 'string' && payload.body.trim() ? payload.body.slice(0, 240) : 'Tap Answer to talk through the laptop.';
    await self.registration.showNotification(expired ? 'Missed family call' : title, {
      body: expired ? 'This call has expired.' : body,
      tag: 'home-call-' + String(payload.callId || 'current').slice(0, 128),
      requireInteraction: true,
      renotify: true,
      silent: false,
      vibrate: [300, 150, 300, 150, 700],
      actions: canAnswer ? [{action: 'answer', title: 'Answer'}] : [],
      data: {url: canAnswer ? answerUrl : null, callId: payload.callId || null},
      timestamp: Date.now()
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const answerUrl = event.notification.data && event.notification.data.url;
  if (!answerUrl || (event.action && event.action !== 'answer')) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const client of windows) {
      if (client.url === answerUrl && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(answerUrl);
  })());
});
