// Cloud City offline helper: repeat visits load at once, the live town data always comes from the network.
const CACHE = 'cloud-city-2';
const isAsset = u => u.origin === location.origin ? /\.(js|webp|png|jpg|webmanifest)$/.test(u.pathname) && u.pathname !== '/sw.js' : u.hostname === 'cdn.jsdelivr.net' || u.hostname === 'fonts.gstatic.com' || u.hostname === 'fonts.googleapis.com';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/_vercel/')) return;
  if (r.mode === 'navigate') { e.respondWith((async () => { const c = await caches.open(CACHE); try { const n = await fetch(r); if (n.ok) c.put('/', n.clone()); return n; } catch { return (await c.match('/')) || Response.error(); } })()); return; }
  if (!isAsset(u)) return;
  e.respondWith((async () => { const c = await caches.open(CACHE), hit = await c.match(r); if (hit) return hit; const n = await fetch(r); if (n.ok || n.type === 'opaque') { for (const old of await c.keys(r, { ignoreSearch: true })) await c.delete(old); await c.put(r, n.clone()); } return n; })());
});
