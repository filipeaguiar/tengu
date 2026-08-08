const CACHE = 'tengu-cache-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request('./', { cache: 'reload' }));
    await cache.add(new Request('./index.html', { cache: 'reload' }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE);
        return cache.match('./index.html');
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      cache.put(request, fresh.clone());
      return fresh;
    } catch {
      return cached ?? Response.error();
    }
  })());
});
