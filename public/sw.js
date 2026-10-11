/**
 * CampusIQ service worker — PWA foundation (Master Spec section 63).
 *
 * HONEST SCOPE: CampusIQ is a data-driven app backed by Supabase. This
 * worker caches the static app shell (HTML/CSS/JS/icons) so the app
 * *launches* offline and shows the offline fallback instead of a browser
 * error — it does NOT cache Supabase API responses, and no lesson,
 * course, exam, or XP data is available without a connection. Do not
 * present this as "CampusIQ works offline" anywhere in the UI; it means
 * "the app shell loads, then tells you you're offline."
 *
 * A later phase may add a real data-caching strategy (e.g. caching a
 * student's already-viewed lessons for offline reading) — that is a
 * deliberate product decision to make later, not an oversight here.
 */

const CACHE_NAME = "campusiq-shell-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/offline.html", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never intercept Supabase (or any cross-origin API) traffic — those
  // requests must reach the network or fail honestly, never serve a
  // stale cached "successful" response for live academic data.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html").then((res) => res ?? Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request))
  );
});
