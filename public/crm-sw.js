/* cf_crm service worker — registered by the CRM page only (src/apps/cf_crm/CfCrmFrame.tsx).
 *
 * It sits at the site root because the CRM is opened at /:company/cf_crm, but
 * it only ever handles CRM requests:
 *   - a page at /<company>/cf_crm…: network first, the last copy when offline
 *   - /cf_crm/… (the app itself) and the fonts / Excel library it loads:
 *     network first, cached copy when offline
 *   - /assets/… (the platform bundle) only when a CRM page asks for it: these
 *     files are fingerprinted, so a cached copy is always right
 * Every other request of every other app passes straight through, untouched.
 * It also shows push alerts and opens the app at the right record when one is tapped.
 * Data never goes through here: the API is on another host and is not cached.
 */
const CACHE = 'cf-crm-v1';
const SHELL_KEY = '/__cf_crm_shell__';
const MAX_ASSETS = 80;
const isCrmPage = (u) => /^\/[^/]+\/cf_crm(\/|$)/.test(u.pathname);

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/cf_crm/app.html', '/cf_crm/app.js', '/cf_crm/app.css', '/cf_crm/icon.svg'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('cf-crm-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok && (res.type === 'basic' || res.type === 'cors' || res.type === 'opaque')) cache.put(key || request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key || request);
    if (hit) return hit;
    throw err;
  }
}

async function trimAssets(cache) {
  const keys = (await cache.keys()).filter((r) => new URL(r.url).pathname.startsWith('/assets/'));
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i]);
}

async function asset(e) {
  const client = e.clientId ? await self.clients.get(e.clientId) : null;
  if (!client || !isCrmPage(new URL(client.url))) return fetch(e.request);
  const cache = await caches.open(CACHE);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res && res.ok) { await cache.put(e.request, res.clone()); trimAssets(cache); }
  return res;
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === self.location.origin) {
    if (r.mode === 'navigate') {
      if (isCrmPage(u)) e.respondWith(networkFirst(r, SHELL_KEY));
      return;
    }
    if (u.pathname.startsWith('/cf_crm/')) { e.respondWith(networkFirst(r)); return; }
    if (u.pathname.startsWith('/assets/')) { e.respondWith(asset(e)); return; }
    return;
  }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(u.host)) e.respondWith(networkFirst(r));
});

/* ---- push alerts ---- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'CRM', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: d.icon || '/cf_crm/icon-192.png',
    badge: d.icon || '/cf_crm/icon-192.png',
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = url.searchParams.get('open') || '';
    // an open CRM window of the same company: bring it forward and show the record there
    const same = wins.find((w) => { const p = new URL(w.url); return isCrmPage(p) && p.pathname.split('/')[1] === url.pathname.split('/')[1]; });
    if (same) {
      await same.focus();
      if (open) same.postMessage({ cfCrmOpen: open });
      return;
    }
    await self.clients.openWindow(url.pathname + url.search);
  })());
});
