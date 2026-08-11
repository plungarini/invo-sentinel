import "server-only";

/**
 * Wraps a slow async fetch with stale-while-revalidate semantics: once a
 * value has been fetched once, every subsequent call returns the cached
 * value IMMEDIATELY (even if past `ttlMs`) and kicks off a background
 * refresh if it's stale - callers never block on the network after the
 * first cold start. This is what actually fixes navigation feeling slow;
 * a short-TTL cache alone still blocks every request once it expires.
 */
export function staleWhileRevalidate<T>(fetcher: () => Promise<T>, ttlMs: number) {
	let cache: { data: T; fetchedAt: number } | null = null;
	let inFlight: Promise<T> | null = null;

	function refresh(): Promise<T> {
		if (!inFlight) {
			inFlight = fetcher()
				.then((data) => {
					cache = { data, fetchedAt: Date.now() };
					return data;
				})
				.finally(() => {
					inFlight = null;
				});
		}
		return inFlight;
	}

	return async function load(): Promise<T> {
		if (!cache) return refresh(); // cold start - nothing to serve yet, must wait
		if (Date.now() - cache.fetchedAt > ttlMs) refresh(); // stale - refresh in the background, don't await
		return cache.data;
	};
}
