import type { Logger } from './logger.js';

/**
 * Default minimum time-to-live for anything cached through this service -
 * deliberately decoupled from `pollIntervalMs`. A follow/unfollow (or any
 * other slow-changing signal cached here) is real-world-rare compared to
 * the poll cadence; refetching it every single cycle just to catch a change
 * that happens a few times a day is pure overhead. 30s is short enough that
 * a real change still shows up within a cycle or two of drift, long enough
 * that a 1-5s poll interval doesn't refetch on nearly every cycle.
 */
export const DEFAULT_MIN_CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
	value: T;
	fetchedAt: number;
	refreshing: boolean;
}

/**
 * Stale-while-revalidate cache for slow-changing data pulled from external
 * APIs. The first call for a key has nothing to serve yet, so it blocks on
 * a real fetch. Every call after that returns the cached value immediately;
 * once the entry is older than `ttlMs`, that same call also kicks off a
 * background refresh (never awaited, never duplicated while one's already
 * in flight) that replaces the cached value for whoever asks next - so a
 * change becomes visible one cycle later, not immediately, in exchange for
 * every other cycle paying zero network cost for this key at all.
 *
 * A failed background refresh never surfaces to the caller (it already got
 * its answer from the still-cached value); it's logged and the entry stays
 * eligible for another refresh attempt on the next call past the TTL.
 */
export class PollCacheService {
	private entries = new Map<string, CacheEntry<unknown>>();

	constructor(private log: Logger) {}

	async getOrRefresh<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
		const entry = this.entries.get(key) as CacheEntry<T> | undefined;
		if (!entry) {
			const value = await fetcher();
			this.entries.set(key, { value, fetchedAt: Date.now(), refreshing: false });
			return value;
		}

		if (!entry.refreshing && Date.now() - entry.fetchedAt >= ttlMs) {
			entry.refreshing = true;
			Promise.resolve()
				.then(fetcher)
				.then((value) => {
					this.entries.set(key, { value, fetchedAt: Date.now(), refreshing: false });
				})
				.catch((e: any) => {
					entry.refreshing = false; // retry eligible again on the next call past the TTL, rather than stuck forever
					this.log({ type: 'poll_cache_refresh_failed', key, message: e.message });
				});
		}

		return entry.value;
	}
}
