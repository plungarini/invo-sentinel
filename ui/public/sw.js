const CACHE_NAME = "invo-sentinel-shell-v1";
const SHELL_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
	);
	self.clients.claim();
});

// Network-first so the dashboard's live trading data is never served stale from cache -
// the cache only exists as an offline fallback for the static shell assets above.
self.addEventListener("fetch", (event) => {
	if (event.request.method !== "GET") return;
	event.respondWith(
		fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
	);
});
