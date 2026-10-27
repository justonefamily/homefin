/* HomeFin service worker: makes the app installable and keeps the shell available offline.
   Pages: network first, falling back to cache. Static assets: cache first. API calls: never cached. */
const VERSION = "homefin-v1";
const SHELL = ["/", "/bills", "/plan", "/insights", "/accounts", "/settings", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/offline.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) ?? (await caches.match("/offline.html")) ?? Response.error()));
  }
});
