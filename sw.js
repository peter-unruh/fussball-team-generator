/* Faire Teams – Service Worker für den Offline-Betrieb.
   Die App selbst (index.html), Manifest und Bilder werden beim ersten Besuch zwischengespeichert. Danach startet
   die App sofort aus dem Speicher – auch am Platz ohne Empfang. Im Hintergrund wird nachgesehen, ob es eine neue
   Version gibt; die App meldet sich dann mit „Eine neue Version der App ist da“.
   Fremde Dienste (Wetter, Ortssuche, Texterkennung, Karten) laufen nicht über diesen Speicher.
   Nach Änderungen an dieser Datei VERSION erhöhen – dann wird der Speicher neu angelegt. */
const VERSION = 'ft-v1';
const CORE = [
  './',
  'manifest.webmanifest',
  'assets/logo-192.png',
  'assets/logo-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'assets/bg-portrait.webp',
  'assets/bg-wide.webp'
];
const scopeUrl = new URL('./', self.location).href;
const isApp = url => url.href.split(/[?#]/)[0] === scopeUrl || url.href.split(/[?#]/)[0] === scopeUrl + 'index.html';
const APP_KEY = scopeUrl;   // die App liegt unter einem Schlüssel, egal ob „/“ oder „/index.html“ aufgerufen wurde

self.addEventListener('install', e => {
  // Einzeln laden: Fehlt ein Bild, wird der Rest trotzdem gespeichert
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ft-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function fromNet(req, key) {
  const res = await fetch(req);
  if (res && res.ok && res.type === 'basic') { const c = await caches.open(VERSION); await c.put(key, res.clone()); }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fremde Dienste: direkt ins Netz
  if (isApp(url)) {
    // Ausdrücklich frisch angefragt (Prüfung auf neue Version): Netz, Ergebnis speichern
    if (req.cache === 'reload' || req.cache === 'no-store') { e.respondWith(fromNet(new Request(url.href.split('#')[0], { cache: 'reload' }), APP_KEY).catch(() => caches.match(APP_KEY))); return; }
    // Sonst: sofort aus dem Speicher, im Hintergrund aktualisieren; ohne Speicher übers Netz
    e.respondWith(caches.match(APP_KEY).then(hit => {
      const net = fromNet(req, APP_KEY);
      if (hit) { e.waitUntil(net.catch(() => null)); return hit; }
      return net;
    }));
    return;
  }
  const path = url.pathname.slice(new URL(scopeUrl).pathname.length);
  if (path === 'manifest.webmanifest' || path.startsWith('assets/')) {
    // Bilder und Manifest: aus dem Speicher, sonst Netz (und merken)
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fromNet(req, req)));
  }
});
