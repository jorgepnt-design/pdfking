/* CoroaPDF Service Worker – eingeschränkte Offline-Nutzung der App-Shell. */
const CACHE_VERSION = "coroapdf-v10";
const PRECACHE = ["/"];

/**
 * Icons und Manifest nie über den Service Worker ausliefern: iOS lädt das
 * Homescreen-Symbol beim „Zum Home-Bildschirm“ und braucht dafür die aktuelle
 * Datei direkt vom Server.
 */
function isAppIconRequest(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/apple-touch-icon") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest"
  );
}

/** Nur erfolgreiche Antworten cachen – sonst würden 404/500 dauerhaft ausgeliefert. */
function cacheIfOk(request, response) {
  if (!response.ok) return;
  const copy = response.clone();
  caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin === self.location.origin && isAppIconRequest(url)) return;

  // Navigationen: Netzwerk zuerst, Fallback auf Cache (App-Shell).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cacheIfOk(request, response);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/"))),
    );
    return;
  }

  // Gleich-origin statische Assets: Cache zuerst.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".woff2"))
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            cacheIfOk(request, response);
            return response;
          }),
      ),
    );
    return;
  }

  // CDN-Assets (z. B. OCR-Sprachdaten): Cache zuerst, danach Netz.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "tessdata.projectnaptha.com") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            cacheIfOk(request, response);
            return response;
          }),
      ),
    );
  }
});
