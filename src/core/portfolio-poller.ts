import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import type { FollowedPortfolio, OpenInvestment } from '../types.js';

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
	) {}

	drainSlowInvoCalls() {
		return this.invo.drainSlowCalls();
	}

	/** Fetched fresh every call; one cheap request, so a new follow/unfollow shows up on the very next poll, not some slower cadence. */
	async fetchFollowedPortfolios(): Promise<FollowedPortfolio[]> {
		const portfolios = await this.invo.getFollowedPortfolios();

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
