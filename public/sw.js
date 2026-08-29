/* Offline support for A Long Walk.
 *
 * This exists because the walk goes through places with no signal. Pages open
 * from the cache, and the last thing the API said is kept so the wall, the
 * route and the map still show something true rather than an empty screen.
 */

const SHELL = "alw-shell-v1";
const DATA = "alw-data-v1";

const PAGES = ["/", "/route", "/messages", "/book", "/journal", "/ahead", "/ahead/place", "/ahead/story", "/ahead/support", "/ahead/question", "/games", "/admin"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL)
      // One missing page must not leave the whole site without a cache, so
      // each is added on its own.
      .then(cache => Promise.all(PAGES.map(page => cache.add(page).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== SHELL && key !== DATA).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The admin's private data and the sync endpoint are never cached.
  if (url.pathname.startsWith("/api/sync") || url.pathname.startsWith("/api/gps") || url.searchParams.get("admin") === "1") return;

  // API: try the network, fall back to the last good answer.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(DATA).then(cache => cache.put(url.pathname, copy));
          }
          return response;
        })
        .catch(() => caches.open(DATA)
          .then(cache => cache.match(url.pathname))
          .then(cached => cached || new Response(JSON.stringify({ offline: true, rows: [] }), {
            status: 503,
            headers: { "content-type": "application/json" },
          })))
    );
    return;
  }

  // Pages: serve from cache first so they open instantly and without signal,
  // and refresh the copy in the background for next time.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(response => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then(cache => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached || caches.match("/"));
        return cached || network;
      })
    );
    return;
  }

  // Everything else: cache what works, and reuse it when the network fails.
  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached || new Response("", { status: 503 })))
  );
});
