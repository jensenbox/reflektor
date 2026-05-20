// Minimal service worker — present only so the app is installable as a PWA.
// No caching: streams must always reach the network in real time.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
