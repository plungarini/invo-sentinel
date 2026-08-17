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

/**
 * Same stale-while-revalidate contract as above, per key - for fetches like
 * "closed investments for portfolio X" that would otherwise re-hit the same
 * upstream endpoint on every single request that needs them (e.g. every
 * History "Load more" page enriching its own handful of entries, with no
 * memory of what the previous page's enrichment already fetched).
 */
export function keyedStaleWhileRevalidate<T>(fetcher: (key: string) => Promise<T>, ttlMs: number) {
	const cache = new Map<string, { data: T; fetchedAt: number }>();
	const inFlight = new Map<string, Promise<T>>();

	function refresh(key: string): Promise<T> {
		let p = inFlight.get(key);
		if (!p) {
			p = fetcher(key)
				.then((data) => {
					cache.set(key, { data, fetchedAt: Date.now() });
					return data;
				})
				.finally(() => {
					inFlight.delete(key);
				});
			inFlight.set(key, p);
		}
		return p;
	}

	return async function load(key: string): Promise<T> {
		const entry = cache.get(key);
		if (!entry) return refresh(key); // cold - must wait
		if (Date.now() - entry.fetchedAt > ttlMs) refresh(key); // stale - refresh in background, don't await
		return entry.data;
	};
}
