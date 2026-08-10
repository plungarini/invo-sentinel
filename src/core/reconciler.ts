import type { HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import type { Logger } from '../services/logger.js';
import type { PortfolioRiskStore } from '../services/portfolio-risk-store.js';
import { resolvePortfolioRisk } from '../services/risk-policy.js';
import type { StateStore } from '../services/state-store.js';
import type { FollowedPortfolio, OpenInvestment, RiskConfig } from '../types.js';
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
	/** Portfolios currently in an invalid-override state, so the warning is logged once on entry, not every cycle. */
	private invalidOverridePortfolioIds = new Set<string>();
	/** Last-logged override signature per portfolio ("min|max"), so a change re-logs but a steady override doesn't spam every cycle. */
	private loggedOverrideSignature = new Map<string, string>();

	constructor(
		private poller: PortfolioPoller,
		private sync: PositionSync,
		private hl: HyperliquidClient,
		private stateStore: StateStore,
		private ignoredStore: IgnoredTradesStore,
		private portfolioRiskStore: PortfolioRiskStore,
		private globalRisk: RiskConfig,
		private log: Logger,
	) {}

	async run(): Promise<void> {
		// Cheap start/end markers with wall-clock duration — the previous two
		// live incidents (see INCIDENT_LOG.md) both required attaching a
		// debugger to a hung process mid-incident to even confirm WHEN a
		// stuck cycle started; a timestamped log line at each phase boundary
		// means that's readable straight from the logs afterward instead.
		const cycleStartedAt = Date.now();
		this.log({ type: 'cycle_start' });

		const state = this.stateStore.load();
		const ignored = this.ignoredStore.load();
		const portfolios = await this.poller.fetchFollowedPortfolios();
		this.log({ type: 'cycle_checkpoint', stage: 'portfolios_fetched', count: portfolios.length });
		const riskEntries = this.portfolioRiskStore.sync(portfolios);

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
			this.log({
				type: 'cycle_checkpoint',
				stage: 'portfolio_start',
				portfolioId: portfolio.id,
				title: portfolio.title,
				investmentCount: investments.length,
			});

			const portfolioOverride = riskEntries.find((e) => e.portfolioId === portfolio.id);
			const { risk, overridden, invalidOverrideReason } = resolvePortfolioRisk(this.globalRisk, portfolioOverride);
			if (invalidOverrideReason) {
				if (!this.invalidOverridePortfolioIds.has(portfolio.id)) {
					this.invalidOverridePortfolioIds.add(portfolio.id);
					this.log({ type: 'invalid_portfolio_risk_override', portfolioId: portfolio.id, title: portfolio.title, reason: invalidOverrideReason });
				}
			} else {
				this.invalidOverridePortfolioIds.delete(portfolio.id);
			}
			if (overridden) {
				const signature = `${risk.minMarginPct}|${risk.maxMarginPct}`;
				if (this.loggedOverrideSignature.get(portfolio.id) !== signature) {
					this.loggedOverrideSignature.set(portfolio.id, signature);
					this.log({
						type: 'portfolio_risk_override_applied',
						portfolioId: portfolio.id,
						title: portfolio.title,
						minMarginPct: risk.minMarginPct * 100,
						maxMarginPct: risk.maxMarginPct * 100,
					});
				}
			} else {
				this.loggedOverrideSignature.delete(portfolio.id);
			}

			const openBaseIds = new Set(investments.map((inv) => inv.baseId));
			for (const investment of investments) {
				try {
					await this.sync.openOrAdjust(investment.baseId, investment, state, investmentsByCoin, ignored, risk);
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

		// The close-detection loop above only ever runs for portfolios still
		// in `perPortfolio` (i.e. still followed right now). If a whole
		// portfolio is unfollowed — not just one investment closing on the
		// trader's side — any baseId tracked from it is never visited by
		// that loop again, ever, so it'd otherwise be silently forgotten
		// (not even flagged, since `logUntrackedPositions` only flags coins
		// with NO state entry at all — this one still has one).
		//
		// Deliberately NOT closing it: unfollowing is a decision about
		// stopping automated management, not an instruction to flatten a
		// real position — especially not one that might be sitting at a
		// loss. Stop tracking it (delete from state, place no order at all)
		// so it becomes a plain untracked wallet position the user handles
		// manually; `logUntrackedPositions` will now correctly flag it.
		// Skip entries with no portfolioId at all (manually `npm run
		// adopt`ed positions never have one) — those were never tied to a
		// followed portfolio to begin with.
		const followedPortfolioIds = new Set(portfolios.map((p) => p.id));
		let untrackedUnfollowed = false;
		for (const [baseId, entry] of Object.entries(state)) {
			if (!entry.portfolioId || followedPortfolioIds.has(entry.portfolioId)) continue;
			this.log({
				type: 'untracking_unfollowed_portfolio_position',
				baseId,
				coin: entry.coin,
				trader: entry.ownerUsername,
				portfolioId: entry.portfolioId,
				reason:
					'portfolio no longer followed; stopping tracking WITHOUT closing — real position left exactly as-is on the wallet for manual handling',
			});
			delete state[baseId];
			untrackedUnfollowed = true;
		}
		if (untrackedUnfollowed) this.stateStore.save(state);
		let unfollowedIgnoredChanged = false;
		for (const [baseId, entry] of Object.entries(ignored)) {
			if (!entry.portfolioId || followedPortfolioIds.has(entry.portfolioId)) continue;
			delete ignored[baseId];
			unfollowedIgnoredChanged = true;
		}
		if (unfollowedIgnoredChanged) this.ignoredStore.save(ignored);

		this.log({ type: 'cycle_complete', durationMs: Date.now() - cycleStartedAt });
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
