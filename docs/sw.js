/* Offline shell + web push. Bump VERSION when app files change. */
const VERSION = "v20";
const SHELL = [
  "./", "index.html", "app.css", "manifest.webmanifest",
  "js/util.js", "js/crypto.js", "js/update.js", "js/stocks.js", "js/vs-list.js", "js/note.js", "js/news.js", "js/trip.js", "js/quotes.js", "js/main.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Data: network first so the morning report is always fresh, cache as fallback.
  if (url.pathname.includes("/data/")) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request)),
    );
    return;
  }
  // App shell: stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const net = fetch(e.request).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    }),
  );
});

self.addEventListener("push", (e) => {
  let d = { title: "BARMS", body: "새 분석이 도착했습니다", url: "./#/stocks" };
  try { d = { ...d, ...e.data.json() }; } catch { /* plain text */ }
  e.waitUntil(self.registration.showNotification(d.title, { body: d.body, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url } }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(target); return c.focus(); } }
      return self.clients.openWindow(target);
    }),
  );
});
