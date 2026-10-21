const CACHE = "riff-shell-v3";
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE),
        response = await fetch("/");
      if (!response.ok) throw new Error("App shell unavailable");
      const html = await response.clone().text();
      const assets = [
        ...new Set(
          Array.from(
            html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g),
            (match) => match[1],
          ),
        ),
      ];
      await cache.addAll([
        "/icon-192.png",
        "/icon-512.png",
        "/audio-worklet.js",
        ...assets,
      ]);
      await cache.put("/", response);
    })(),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("riff-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api") ||
    url.search
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/")));
    return;
  }
  if (
    url.pathname.startsWith("/_next/static/") ||
    ["/icon.svg", "/audio-worklet.js"].includes(url.pathname)
  )
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches
                .open(CACHE)
                .then((cache) => cache.put(event.request, clone));
            }
            return response;
          }),
      ),
    );
});
