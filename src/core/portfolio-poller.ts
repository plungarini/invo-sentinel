import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import { DEFAULT_MIN_CACHE_TTL_MS, type PollCacheService } from '../services/poll-cache.js';
import type { FollowedPortfolio, OpenInvestment } from '../types.js';

const FOLLOWED_PORTFOLIOS_CACHE_KEY = 'followedPortfolios';

/**
 * The "consumer" side of Invo: turns the two polling endpoints
 * (get_users_followed_portfolios, get_investments) into typed data for the
 * reconciler, and tracks the followed-portfolio set only to log when it
 * actually changes (so a new follow/unfollow is visible without spamming
 * a log line every single cycle).
 */
export class PortfolioPoller {
	private knownPortfolioIds = new Set<string>();

	constructor(
		private invo: InvoClient,
		private log: Logger,
		private pollCache: PollCacheService,
	) {}

	drainSlowInvoCalls() {
		return this.invo.drainSlowCalls();
	}

	/**
	 * Stale-while-revalidate, not fetched fresh every call - a follow/unfollow
	 * is real-world-rare compared to the poll cadence, so paying for this
	 * call every single cycle (its own ~1-1.2s baseline, per call-timing.ts)
	 * just to catch a change that happens a few times a day was pure
	 * overhead. A change now shows up within one cache TTL of drift instead
	 * of on the very next poll - see poll-cache.ts.
	 */
	async fetchFollowedPortfolios(): Promise<FollowedPortfolio[]> {
		const portfolios = await this.pollCache.getOrRefresh(FOLLOWED_PORTFOLIOS_CACHE_KEY, DEFAULT_MIN_CACHE_TTL_MS, () =>
			this.invo.getFollowedPortfolios(),
		);

		const currentIds = new Set<string>(portfolios.map((p) => p.id));
		const added = portfolios.filter((p) => !this.knownPortfolioIds.has(p.id));
		const removedIds = [...this.knownPortfolioIds].filter((id) => !currentIds.has(id));

		if (added.length > 0 || removedIds.length > 0) {
			this.log({
				type: 'followed_portfolios_changed',
				count: portfolios.length,
				added: added.map((p) => ({ id: p.id, title: p.title, owner: p.ownerUsername })),
				removedIds,
			});
			this.knownPortfolioIds = currentIds;
		}

		return portfolios;
	}

	/** Currently-open, verified trades for one portfolio. This is backfill and live tracking at once; there's no separate "catch up on history" step. */
	async fetchOpenInvestments(portfolioId: string): Promise<OpenInvestment[]> {
		const investments = await this.invo.getOpenInvestments(portfolioId);
		return investments.filter((inv) => inv.verifiedTrade);
	}
}
