import type { HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import type { Logger } from '../services/logger.js';
import type { StateStore } from '../services/state-store.js';
import type { FollowedPortfolio, OpenInvestment } from '../types.js';
import type { PortfolioPoller } from './portfolio-poller.js';
import type { PositionSync } from './position-sync.js';

/**
 * One full cycle: gather every currently-open investment across all
 * followed portfolios, act on each (open/adjust, via PositionSync), then
 * close anything tracked that's no longer in its trader's open list.
 *
 * Gathering ALL portfolios before acting on ANY of them (rather than
 * portfolio-by-portfolio) is what lets PositionSync tell an unambiguous
 * existing position (exactly one follower has this coin open) apart from
 * a genuinely ambiguous one (several do); it needs the whole picture
 * up front, not a partial one.
 */
export class Reconciler {
	constructor(
		private poller: PortfolioPoller,
		private sync: PositionSync,
		private hl: HyperliquidClient,
		private stateStore: StateStore,
		private ignoredStore: IgnoredTradesStore,
		private log: Logger,
	) {}

	async run(): Promise<void> {
		const state = this.stateStore.load();
		const ignored = this.ignoredStore.load();
		const portfolios = await this.poller.fetchFollowedPortfolios();

		const perPortfolio: { portfolio: FollowedPortfolio; investments: OpenInvestment[] | null }[] = [];
		for (const portfolio of portfolios) {
			try {
				perPortfolio.push({ portfolio, investments: await this.poller.fetchOpenInvestments(portfolio.id) });
			} catch (e: any) {
				this.log({
					type: 'error',
					source: 'fetch_open_investments',
					portfolioId: portfolio.id,
					title: portfolio.title,
					message: e.message,
				});
				perPortfolio.push({ portfolio, investments: null }); // null = fetch failed; skip close-detection for it below
			}
		}

		const investmentsByCoin = new Map<string, OpenInvestment[]>();
		for (const { investments } of perPortfolio) {
			if (!investments) continue;
			for (const inv of investments) {
				const list = investmentsByCoin.get(inv.ticker) ?? [];
				list.push(inv);
				investmentsByCoin.set(inv.ticker, list);
			}
		}

		for (const { portfolio, investments } of perPortfolio) {
			if (!investments) continue;

			const openBaseIds = new Set(investments.map((inv) => inv.baseId));
			for (const investment of investments) {
				try {
					await this.sync.openOrAdjust(investment.baseId, investment, state, investmentsByCoin, ignored);
				} catch (e: any) {
					this.log({
						type: 'error',
						source: 'open_or_adjust',
						baseId: investment.baseId,
						coin: investment.ticker,
						message: e.message,
					});
				}
				this.stateStore.save(state);
				this.ignoredStore.save(ignored);
			}

			// Anything tracked for THIS portfolio that's no longer in its open
			// list has been closed (or reduced to zero) on the trader's side.
			for (const [baseId, entry] of Object.entries(state)) {
				if (entry.portfolioId !== portfolio.id) continue;
				if (openBaseIds.has(baseId)) continue;
				try {
					await this.sync.close(baseId, state);
				} catch (e: any) {
					this.log({ type: 'error', source: 'close', baseId, coin: entry.coin, message: e.message });
				}
				this.stateStore.save(state);
			}

			// Same cleanup for ignored baseIds: once that investment is gone
			// from the trader's own open list, the ignore entry has nothing
			// left to guard against — any future trade from them gets a fresh
			// baseId anyway.
			let ignoredChanged = false;
			for (const [baseId, entry] of Object.entries(ignored)) {
				if (entry.portfolioId !== portfolio.id) continue;
				if (openBaseIds.has(baseId)) continue;
				delete ignored[baseId];
				ignoredChanged = true;
			}
			if (ignoredChanged) this.ignoredStore.save(ignored);
		}
	}

	/**
	 * Direct wallet check: cross-references your REAL Hyperliquid positions
	 * against what's tracked after a run(). Anything open on your wallet
	 * that isn't tracked is NOT managed by this daemon (most likely
	 * existing_position_conflict fired for it); flagged so that's a known
	 * fact, not a silent gap.
	 */
	async logUntrackedPositions(): Promise<void> {
		try {
			const state = this.stateStore.load();
			const trackedCoins = new Set(Object.values(state).map((s) => s.coin));
			const livePositions = await this.hl.getPositions();
			const untracked = livePositions.filter((p) => !trackedCoins.has(p.coin));
			if (untracked.length > 0) {
				this.log({
					type: 'untracked_positions',
					note: 'these are open on your wallet but NOT managed by this daemon; see existing_position_conflict, or use adopt/close-position',
					positions: untracked.map((p) => ({ coin: p.coin, szi: p.szi })),
				});
			}
		} catch (e: any) {
			this.log({ type: 'error', source: 'wallet_reconciliation', message: e.message });
		}
	}
}
