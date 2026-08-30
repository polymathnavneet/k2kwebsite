/* Offline support for A Long Walk.
 *
 * This exists because the walk goes through places with no signal. Pages open
 * from the cache, and the last thing the API said is kept so the wall, the
 * route and the map still show something true rather than an empty screen.
 */

const SHELL = "alw-shell-v2";
const DATA = "alw-data-v2";

const PAGES = ["/", "/route", "/about", "/sponsor", "/messages", "/book", "/journal", "/gallery", "/ahead", "/ahead/place", "/ahead/story", "/ahead/support", "/ahead/question", "/games", "/admin"];

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

  // Pages: the network first, with the cache close behind.
  //
  // Serving the cache first made every visit show the previous visit's page.
  // A change published minutes ago only appeared on the second opening, which
  // is why the site kept needing a pull-to-refresh to show anything new. The
  // network is tried first and given three seconds - long enough for a weak
  // signal, short enough not to feel broken - and the cached copy answers if
  // that fails or times out. Offline behaviour is unchanged: no network means
  // the cache, immediately.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await Promise.race([
          fetch(request),
          new Promise((resolve, reject) => setTimeout(() => reject(new Error("slow")), 3000)),
        ]);
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(request, copy));
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached || (await caches.match("/")) || new Response("", { status: 503 });
      }
    })());
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
