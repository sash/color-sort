const BUILD = '3f5c9f41bea2';
const CACHE = `color-sort-${BUILD}`;
const ASSETS = ['index.html', 'manifest.webmanifest', 'levels.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
    // Fetch a complete, matching release before replacing the working offline copy.
    const responses = await Promise.all(ASSETS.map(async path => {
      const url = new URL(path, self.registration.scope);
      url.searchParams.set('build', BUILD);
      const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw Error(`Could not download ${path}`);
      const bytes = await response.arrayBuffer();
      if (path === 'index.html' && !new TextDecoder().decode(bytes).includes(`<meta name="game-build" content="${BUILD}">`)) throw Error('Release is not ready');
      return new Response(bytes, {status: response.status, headers: response.headers});
    }));
    const cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map((path, i) => cache.put(new URL(path, self.registration.scope), responses[i])));
    await self.skipWaiting();
    } finally { clearTimeout(timeout); }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith('color-sort-') && key !== CACHE);
    await Promise.all(old.map(key => caches.delete(key)));
    await self.clients.claim();
    // Also upgrade installed copies released before the in-game update controls existed.
    if (old.length) for (const client of await self.clients.matchAll({type: 'window'})) {
      if (client.url.startsWith(self.registration.scope)) void client.navigate(client.url).catch(() => {});
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (url.pathname.endsWith('/version.json') || request.cache === 'no-store') {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 4000);
      try {
        url.searchParams.set('navigation', String(Date.now()));
        const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw Error('Game unavailable');
        return response;
      } catch (error) {
        const offline = await cache.match(new URL('index.html', self.registration.scope));
        if (offline) return offline;
        throw error;
      } finally { clearTimeout(timeout); }
    }
    return await cache.match(request) || fetch(request);
  })());
});
