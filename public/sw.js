/* Public offline copies are separate from private admin responses. */
const SHELL = "alw-shell-v3";
const DATA = "alw-data-v3";
const PAGES = ["/", "/route", "/about", "/sponsor", "/messages", "/book", "/journal", "/gallery", "/ahead", "/ahead/place", "/ahead/story", "/ahead/support", "/ahead/question", "/ahead/walk", "/ahead/road", "/games", "/admin"];
const PUBLIC_APIS = new Set(["/api/journey", "/api/route", "/api/gps", "/api/messages", "/api/book", "/api/journal", "/api/media", "/api/timeline", "/api/reactions", "/api/content", "/api/days"]);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.all(PAGES.map(page => cache.add(page).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => /^alw-(shell|data)-/.test(key) && key !== SHELL && key !== DATA).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function remember(event, name, request, response) {
  if (!response.ok || /private/i.test(response.headers.get("cache-control") || "")) return;
  const copy = response.clone();
  event.waitUntil(caches.open(name).then(cache => cache.put(request, copy)).catch(() => {}));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Tracker GETs write positions, and private GETs can carry contact details
  // or tracker keys. Neither may be replayed from an offline cache.
  if (["authorization", "x-admin-token", "x-track-key", "x-assistant-key"].some(header => request.headers.has(header))
    || ["admin", "key", "token"].some(key => url.searchParams.has(key))) return;

  if (url.pathname.startsWith("/api/")) {
    if (!PUBLIC_APIS.has(url.pathname)) return;
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
        if (response.status >= 500) throw new Error("temporarily unavailable");
        remember(event, DATA, request, response);
        return response;
      } catch {
        const cached = await (await caches.open(DATA)).match(request);
        return cached || Response.json({ offline: true, error: "No saved copy is available." }, { status: 503 });
      }
    })());
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { signal: AbortSignal.timeout(5000) });
        if (response.status >= 500) throw new Error("temporarily unavailable");
        remember(event, SHELL, request, response);
        return response;
      } catch {
        const cached = await (await caches.open(SHELL)).match(request);
        return cached || new Response("This page has no saved offline copy. Please reconnect and try again.", {
          status: 503, headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  // RSC/prefetch responses share page URLs with HTML. Only static resources
  // belong here, otherwise a cached navigation can become a raw data packet.
  if (!/\.(?:m?js|css|woff2?|ttf|svg|png|jpe?g|webp|gif|ico)(?:$)/i.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      remember(event, SHELL, request, response);
      return response;
    } catch { return new Response("", { status: 503 }); }
  })());
});
