const CACHE_NAME = "naru-europe-2026-v20";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css?v=20260607-csv-encoding",
  "./js/app.js?v=20260607-csv-encoding",
  "./manifest.webmanifest",
  "./assets/icons/icon.svg",
  "./assets/cover/family-photo-placeholder.svg",
  "./assets/cities/rome.png",
  "./assets/cities/dolomites.png",
  "./assets/cities/paris.png",
  "./assets/tickets/sample-train-ticket.svg",
  "./data/trip.csv",
  "./data/participants.csv",
  "./data/city_info.csv",
  "./data/days.csv",
  "./data/events.csv",
  "./data/transports.csv",
  "./data/stays.csv",
  "./data/places.csv",
  "./data/tickets.csv",
  "./data/documents.csv",
  "./data/naru_checklist.csv",
  "./data/checklist.csv",
  "./data/safety.csv",
  "./data/flash_cards.csv"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const url = new URL(event.request.url);
      const shouldRefresh = event.request.cache === "no-cache" || url.pathname.endsWith(".csv");
      const network = fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
      return shouldRefresh ? network : cached || network;
    })
  );
});
