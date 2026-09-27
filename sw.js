// Service worker for the AWS Mock Exam Simulator PWA.
// Strategy:
//  - App shell (HTML/CSS/JS/manifest/icons): cache-first, so the app opens instantly offline.
//  - Question bank data (banks.json + each cert folder's *.json files, e.g. dva/bank1.json):
//    stale-while-revalidate, so a new or edited bank is picked up automatically when online,
//    but a cached copy still works offline.
// Bump CACHE_VERSION whenever the app shell files change, so old caches get cleared.

const CACHE_VERSION = "v1";
const SHELL_CACHE = "aws-exam-shell-" + CACHE_VERSION;
const DATA_CACHE = "aws-exam-data-" + CACHE_VERSION;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./banks.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Question bank data is every .json file except the PWA's own manifest.json
  // at the site root (banks.json and anything under a cert folder like dva/, saa/
  // all count as data, however many folders are added later).
  const isAppManifest = url.pathname.endsWith("/manifest.json");
  const isQuestionData = url.pathname.endsWith(".json") && !isAppManifest;

  if (isQuestionData) {
    // Stale-while-revalidate: serve cached copy immediately if present,
    // and refresh the cache in the background for next time.
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) => {
        return cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                cache.put(req, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        });
      }),
    );
    return;
  }

  // App shell: cache-first, falling back to network, falling back to the
  // cached index.html for navigation requests (so deep refreshes still work offline).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.ok &&
            url.origin === location.origin
          ) {
            const copy = networkResponse.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          if (req.mode === "navigate") {
            return caches.match("./index.html");
          }
          return undefined;
        });
    }),
  );
});
