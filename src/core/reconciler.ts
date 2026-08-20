import type { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { RateLimitExhaustedError } from '../clients/invo-client.js';
import type { InvoClient } from '../clients/invo-client.js';
import type { CloidAttributionStore } from '../services/cloid-attribution-store.js';
import type { CycleFillsCache } from '../services/cycle-fills-cache.js';
import type { FollowedPortfoliosStore } from '../services/followed-portfolios-store.js';
import type { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import type { Logger } from '../services/logger.js';
import type { PortfolioRiskStore } from '../services/portfolio-risk-store.js';
import { resolvePortfolioRisk } from '../services/risk-policy.js';
import type { StateStore } from '../services/state-store.js';
import type { CloidAttributionCache, EmergencyConfig, FollowedPortfolio, HyperliquidPosition, IgnoredTradesMap, OpenInvestment, PortfolioRiskEntry, PositionStateMap, RiskConfig, TraderModeConfig } from '../types.js';
import { discoverCloidAttributedCoins, type ResolvedAttribution } from './cloid-attribution.js';
import type { PortfolioPoller } from './portfolio-poller.js';
import type { PositionSync } from './position-sync.js';

/**
 * One full cycle: gather every currently-open investment across all
 * followed portfolios, act on each (open/adjust, via PositionSync), then
 * close anything tracked that's no longer in its trader's open list. Also
 * discovers and adopts positions the user mimicked directly through Invo's
 * own app (not via this daemon), via cloid decoding - see cloid-attribution.ts.
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
	/** The global band as of the previous cycle, so a change can be logged explicitly - a mid-run edit resizes every clamped position within seconds, real orders that would otherwise be indistinguishable in the logs from trader-driven adjustments (and unexplainable by reconcile.ts's Invo/HL audit). `null` until the first cycle completes, so boot itself is never logged as a "change". */
	private lastGlobalRisk: RiskConfig | null = null;
	/** baseIds already logged as detached-from-an-unfollowed-portfolio, so the transition is logged once, not every cycle for as long as the real position stays open. */
	private loggedDetachedBaseIds = new Set<string>();

	constructor(
		private poller: PortfolioPoller,
		private sync: PositionSync,
		private hl: HyperliquidClient,
		private invo: InvoClient,
		private stateStore: StateStore,
		private ignoredStore: IgnoredTradesStore,
		private portfolioRiskStore: PortfolioRiskStore,
		private followedPortfoliosStore: FollowedPortfoliosStore,
		private cloidAttributionStore: CloidAttributionStore,
		private cycleFillsCache: CycleFillsCache,
		/** Called once at the top of every cycle, not just at construction - a settings-page edit to the global margin band takes effect on the next cycle, not just at daemon restart. */
		private getGlobalRisk: () => RiskConfig,
		/** Same convention as `getGlobalRisk` - re-read fresh every cycle so a Trader-mode settings change takes effect on the next cycle. */
		private getTraderMode: () => TraderModeConfig,
		/** Same convention - the two emergency kill switches, re-read fresh every cycle so a settings-page flip takes effect on the next one, not just at daemon restart. */
		private getEmergency: () => EmergencyConfig,
		private log: Logger,
	) {}

	async run(): Promise<{ followedPortfolioCount: number | null; adHocPortfolioCount: number | null }> {
		// Cheap start/end markers with wall-clock duration - the previous two
		// live incidents (see INCIDENT_LOG.md) both required attaching a
		// debugger to a hung process mid-incident to even confirm WHEN a
		// stuck cycle started; a timestamped log line at each phase boundary
		// means that's readable straight from the logs afterward instead.
		const cycleStartedAt = Date.now();
		this.log({ type: 'cycle_start' });

		const emergency = this.getEmergency();
		if (emergency.fullStop) {
			// Halts everything - no opens/adjusts/closes, not even a fetch to
			// look at what's out there - leaving every real position exactly
			// as-is for manual handling, same contract as an unfollowed
			// portfolio's detached positions, just applied globally.
			this.log({ type: 'cycle_skipped_full_stop' });
			this.log({ type: 'cycle_complete', durationMs: Date.now() - cycleStartedAt, skipped: true });
			return { followedPortfolioCount: null, adHocPortfolioCount: null };
		}

		const globalRisk = this.getGlobalRisk();
		if (
			this.lastGlobalRisk &&
			(this.lastGlobalRisk.minMarginPct !== globalRisk.minMarginPct ||
				this.lastGlobalRisk.maxMarginPct !== globalRisk.maxMarginPct ||
				this.lastGlobalRisk.maxLeverage !== globalRisk.maxLeverage)
		) {
			this.log({
				type: 'risk_band_changed',
				from: {
					minMarginPct: this.lastGlobalRisk.minMarginPct * 100,
					maxMarginPct: this.lastGlobalRisk.maxMarginPct * 100,
					maxLeverage: this.lastGlobalRisk.maxLeverage ?? null,
				},
				to: {
					minMarginPct: globalRisk.minMarginPct * 100,
					maxMarginPct: globalRisk.maxMarginPct * 100,
					maxLeverage: globalRisk.maxLeverage ?? null,
				},
			});
		}
		this.lastGlobalRisk = globalRisk;
		const traderMode = this.getTraderMode();

		const state = this.stateStore.load();
		const ignored = this.ignoredStore.load();
		const cloidCache = this.cloidAttributionStore.load();
		this.cycleFillsCache.reset();

		let portfolios: FollowedPortfolio[];
		try {
			portfolios = await this.poller.fetchFollowedPortfolios();
		} catch (e: any) {
			// This is the FIRST Invo call of the cycle - unlike the per-
			// portfolio investments loop below, nothing here was in a try/
			// catch at all before, so a RateLimitExhaustedError propagated
			// all the way out of run() to auto-copy.ts's outer catch, which
			// calls pingFail() - reporting the daemon as genuinely DOWN to
			// healthchecks.io for what's actually just a transient, self-
			// recovering external rate limit the daemon handles gracefully
			// every other cycle. Confirmed live 2026-08-12: healthchecks.io
			// flapped up/down every few minutes for ~30min while every
			// individual reconcile cycle that DID get past this call
			// completed normally in ~9-10s - the daemon was never actually
			// down, only this one call was periodically rate-limited.
			// Returning cleanly here (not throwing) means auto-copy.ts's
			// main loop calls pingSuccess() same as any other cycle - an
			// accurate signal, since the process is alive and will retry
			// immediately next cycle, not stuck or crashed.
			if (e instanceof RateLimitExhaustedError) {
				this.log({ type: 'cycle_skipped_rate_limited', reason: e.message });
				this.log({ type: 'cycle_complete', durationMs: Date.now() - cycleStartedAt, skipped: true });
				return { followedPortfolioCount: null, adHocPortfolioCount: null };
			}
			throw e;
		}
		this.log({ type: 'cycle_checkpoint', stage: 'portfolios_fetched', count: portfolios.length });
		this.followedPortfoliosStore.save(portfolios);
		const riskEntries = this.portfolioRiskStore.sync(portfolios);
		const followedPortfolioIds = new Set(portfolios.map((p) => p.id));

		// Portfolios behind an already-adopted manually-mimicked position that
		// aren't followed. Derived from `state`, not this cycle's fetch
		// results, so it stays correct even if this cycle's fetches fail.
		// Freshly cloid-discovered portfolios (this cycle) are added below,
		// once resolved.
		const adHocPortfolioIds = new Set<string>();
		for (const entry of Object.values(state)) {
			if (entry.portfolioId && !followedPortfolioIds.has(entry.portfolioId)) adHocPortfolioIds.add(entry.portfolioId);
		}

		const perPortfolio: { portfolioId: string; title: string; investments: OpenInvestment[] | null; isAdHoc: boolean }[] = [];
		let rateLimitExhausted = false;

		for (const [i, portfolio] of portfolios.entries()) {
			if (rateLimitExhausted) {
				perPortfolio.push({ portfolioId: portfolio.id, title: portfolio.title, investments: null, isAdHoc: false });
				continue;
			}
			try {
				perPortfolio.push({
					portfolioId: portfolio.id,
					title: portfolio.title,
					investments: await this.poller.fetchOpenInvestments(portfolio.id),
					isAdHoc: false,
				});
			} catch (e: any) {
				if (e instanceof RateLimitExhaustedError) {
					// Shared IP budget is down - every remaining portfolio this cycle would fail the same way; stop here, retry next cycle.
					rateLimitExhausted = true;
					const remaining = portfolios.slice(i);
					this.log({
						type: 'rate_limit_exhausted_skipping_rest_of_cycle',
						portfolioId: portfolio.id,
						title: portfolio.title,
						skippedCount: remaining.length,
						skippedPortfolios: remaining.map((p) => p.title),
					});
					for (const skipped of remaining) {
						if (skipped.id === portfolio.id) continue;
						perPortfolio.push({ portfolioId: skipped.id, title: skipped.title, investments: null, isAdHoc: false });
					}
					perPortfolio.push({ portfolioId: portfolio.id, title: portfolio.title, investments: null, isAdHoc: false });
					continue;
				}
				this.log({
					type: 'error',
					source: 'fetch_open_investments',
					portfolioId: portfolio.id,
					title: portfolio.title,
					message: e.message,
				});
				perPortfolio.push({ portfolioId: portfolio.id, title: portfolio.title, investments: null, isAdHoc: false }); // null = fetch failed; skip close-detection for it below
			}
		}

		for (const portfolioId of adHocPortfolioIds) {
			const title = `ad-hoc:${portfolioId}`;
			if (rateLimitExhausted) {
				perPortfolio.push({ portfolioId, title, investments: null, isAdHoc: true });
				continue;
			}
			try {
				perPortfolio.push({ portfolioId, title, investments: await this.poller.fetchOpenInvestments(portfolioId), isAdHoc: true });
			} catch (e: any) {
				if (e instanceof RateLimitExhaustedError) {
					rateLimitExhausted = true;
					this.log({ type: 'rate_limit_exhausted_skipping_rest_of_cycle', portfolioId, isAdHoc: true });
					perPortfolio.push({ portfolioId, title, investments: null, isAdHoc: true });
					continue;
				}
				this.log({ type: 'error', source: 'fetch_open_investments', portfolioId, isAdHoc: true, message: e.message });
				perPortfolio.push({ portfolioId, title, investments: null, isAdHoc: true });
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

		for (const { portfolioId, title, investments, isAdHoc } of perPortfolio) {
			if (!investments) continue;
			this.log({
				type: 'cycle_checkpoint',
				stage: 'portfolio_start',
				portfolioId,
				title,
				investmentCount: investments.length,
				isAdHoc: isAdHoc || undefined,
			});

			let risk = globalRisk;
			if (!isAdHoc) {
				// Ad-hoc (manually-mimicked) portfolios don't support a risk-band
				// override in this version - PortfolioRiskStore only syncs
				// entries for followed portfolios; always the global band.
				const portfolioOverride = riskEntries.find((e) => e.portfolioId === portfolioId);
				const resolved = resolvePortfolioRisk(globalRisk, portfolioOverride);
				risk = resolved.risk;
				if (resolved.invalidOverrideReason) {
					if (!this.invalidOverridePortfolioIds.has(portfolioId)) {
						this.invalidOverridePortfolioIds.add(portfolioId);
						this.log({ type: 'invalid_portfolio_risk_override', portfolioId, title, reason: resolved.invalidOverrideReason });
					}
				} else {
					this.invalidOverridePortfolioIds.delete(portfolioId);
				}
				if (resolved.overridden) {
					const signature = `${risk.minMarginPct}|${risk.maxMarginPct}`;
					if (this.loggedOverrideSignature.get(portfolioId) !== signature) {
						this.loggedOverrideSignature.set(portfolioId, signature);
						this.log({
							type: 'portfolio_risk_override_applied',
							portfolioId,
							title,
							minMarginPct: risk.minMarginPct * 100,
							maxMarginPct: risk.maxMarginPct * 100,
						});
					}
				} else {
					this.loggedOverrideSignature.delete(portfolioId);
				}
			}

			// Ad-hoc portfolios here are ones already adopted in a prior cycle
			// (tracked in `state`); only act on those specific baseIds. A
			// freshly cloid-discovered portfolio (this cycle) is fetched and
			// processed separately below, once resolved.
			const allowedBaseIds = isAdHoc
				? new Set(Object.entries(state).filter(([, s]) => s.portfolioId === portfolioId).map(([baseId]) => baseId))
				: null;

			await this.processPortfolioInvestments(portfolioId, title, investments, risk, traderMode, state, investmentsByCoin, ignored, allowedBaseIds, emergency.noNewPositions);
		}

		// Never blocks the rest of the cycle on failure - same as every other
		// HL/Invo call in this file, but this one's own hl.getPositions() at
		// the top isn't behind any of the existing per-portfolio/per-
		// investment try/catches, so it needs its own (confirmed live
		// 2026-08-15: an HL API blip here propagated all the way out of
		// run() to auto-copy.ts's outer catch, which calls pingFail() -
		// reporting the daemon as down for what should have been a
		// transient, gracefully-tolerated hiccup like any other).
		try {
			await this.discoverAndAdoptCloidAttributedPositions(cloidCache, state, ignored, investmentsByCoin, riskEntries, followedPortfolioIds, adHocPortfolioIds, globalRisk, traderMode, emergency.noNewPositions);
		} catch (e: any) {
			this.log({ type: 'error', source: 'cloid_attribution_discovery', message: e.message });
		}
		this.cloidAttributionStore.save(cloidCache);

		// A whole portfolio going unfollowed (not just one investment closing)
		// stops mirroring the TRADER's signal for anything tracked from it -
		// nothing here ever places a close order - but the trade itself keeps
		// being tracked independently, on its own, exactly like any other
		// tracked position: still cross-checked for a manual/external close,
		// still fully visible to analytics via its own PositionState (which
		// keeps portfolioId/portfolioTitle regardless of follow state). Skip
		// entries with no portfolioId (manually `npm run adopt`ed) and
		// ad-hoc-tracked portfolios, which were never followed to begin with.
		const knownPortfolioIds = new Set([...followedPortfolioIds, ...adHocPortfolioIds]);
		const detachedEntries = Object.entries(state).filter(([, entry]) => entry.portfolioId && !knownPortfolioIds.has(entry.portfolioId));
		if (detachedEntries.length > 0) {
			for (const [baseId, entry] of detachedEntries) {
				if (this.loggedDetachedBaseIds.has(baseId)) continue;
				this.loggedDetachedBaseIds.add(baseId);
				this.log({
					type: 'portfolio_unfollowed_position_detached',
					baseId,
					coin: entry.coin,
					trader: entry.ownerUsername,
					portfolioId: entry.portfolioId,
					reason:
						'portfolio no longer followed; no longer mirroring this trader\'s signal, but continuing to track this open position independently until it closes (manually, or on its own) - never auto-closed by this daemon',
				});
			}

			// Only reconciled the other direction here (already closed for real
			// -> stop tracking); never the reverse. A failed fetch leaves every
			// detached entry exactly as tracked, retried next cycle, rather than
			// risking treating "we couldn't check" as "it's gone".
			let livePositions: HyperliquidPosition[] | null = null;
			try {
				livePositions = await this.hl.getPositions();
			} catch (e: any) {
				this.log({ type: 'error', source: 'detached_position_check', message: e.message });
			}
			if (livePositions) {
				let stateChanged = false;
				for (const [baseId] of detachedEntries) {
					const wasTracked = !!state[baseId];
					await this.sync.finalizeIfDetachedPositionClosed(baseId, state, livePositions, traderMode);
					if (wasTracked && !state[baseId]) {
						this.loggedDetachedBaseIds.delete(baseId);
						stateChanged = true;
					}
				}
				if (stateChanged) this.stateStore.save(state);
			}
		}
		let unfollowedIgnoredChanged = false;
		for (const [baseId, entry] of Object.entries(ignored)) {
			if (!entry.portfolioId || knownPortfolioIds.has(entry.portfolioId)) continue;
			delete ignored[baseId];
			unfollowedIgnoredChanged = true;
		}
		if (unfollowedIgnoredChanged) this.ignoredStore.save(ignored);

		// Diagnostic-only (see INCIDENT_LOG.md 2026-08-11 latency-bump
		// investigation): surfaces which specific outbound call was slow this
		// cycle, if any, instead of just a slow cycle_complete duration with
		// no way to tell Invo vs Hyperliquid vs which endpoint apart.
		for (const call of [...this.poller.drainSlowInvoCalls(), ...this.hl.drainSlowCalls()]) {
			this.log({ type: 'slow_api_call', ...call });
		}

		this.log({ type: 'cycle_complete', durationMs: Date.now() - cycleStartedAt });
		return { followedPortfolioCount: portfolios.length, adHocPortfolioCount: adHocPortfolioIds.size };
	}

	/** Shared by followed and ad-hoc portfolios. `allowedBaseIds` null = act on every investment (followed); a Set restricts to those baseIds only (ad-hoc). `portfolioTitle` is passed through to `sync.close` purely as a point-in-time snapshot for the durable closed-trade record. */
	private async processPortfolioInvestments(
		portfolioId: string,
		portfolioTitle: string | undefined,
		investments: OpenInvestment[],
		risk: RiskConfig,
		traderMode: TraderModeConfig,
		state: PositionStateMap,
		investmentsByCoin: Map<string, OpenInvestment[]>,
		ignored: IgnoredTradesMap,
		allowedBaseIds: Set<string> | null,
		noNewPositions: boolean,
	): Promise<void> {
		const relevantInvestments = allowedBaseIds ? investments.filter((inv) => allowedBaseIds.has(inv.baseId)) : investments;
		const openBaseIds = new Set(investments.map((inv) => inv.baseId));

		for (const investment of relevantInvestments) {
			try {
				await this.sync.openOrAdjust(investment.baseId, investment, state, investmentsByCoin, ignored, risk, traderMode, noNewPositions);
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
			if (entry.portfolioId !== portfolioId) continue;
			if (openBaseIds.has(baseId)) continue;
			try {
				await this.sync.close(baseId, state, traderMode, portfolioTitle);
			} catch (e: any) {
				this.log({ type: 'error', source: 'close', baseId, coin: entry.coin, message: e.message });
			}
			this.stateStore.save(state);
		}

		// Same cleanup for ignored baseIds: once that investment is gone
		// from the trader's own open list, the ignore entry has nothing
		// left to guard against - any future trade from them gets a fresh
		// baseId anyway.
		let ignoredChanged = false;
		for (const [baseId, entry] of Object.entries(ignored)) {
			if (entry.portfolioId !== portfolioId) continue;
			if (openBaseIds.has(baseId)) continue;
			delete ignored[baseId];
			ignoredChanged = true;
		}
		if (ignoredChanged) this.ignoredStore.save(ignored);
	}

	/**
	 * Finds any live HL position not yet tracked, resolves it via cloid
	 * decoding (see cloid-attribution.ts) - deterministic, so unlike the old
	 * notification/TP-SL-based approach this either adopts the same cycle
	 * it's discovered or doesn't touch it at all; there's no pending/timeout
	 * state to carry between cycles. A resolved investment whose portfolio
	 * isn't already being fetched this cycle gets one ad-hoc fetch here.
	 */
	private async discoverAndAdoptCloidAttributedPositions(
		cloidCache: CloidAttributionCache,
		state: PositionStateMap,
		ignored: IgnoredTradesMap,
		investmentsByCoin: Map<string, OpenInvestment[]>,
		riskEntries: PortfolioRiskEntry[],
		followedPortfolioIds: Set<string>,
		adHocPortfolioIds: Set<string>,
		globalRisk: RiskConfig,
		traderMode: TraderModeConfig,
		noNewPositions: boolean,
	): Promise<void> {
		const positions = await this.hl.getPositions();
		const { resolved } = await discoverCloidAttributedCoins(this.hl, this.invo, positions, state, cloidCache, this.log);
		if (resolved.size === 0) return;

		const byPortfolio = new Map<string, { coin: string; attribution: ResolvedAttribution }[]>();
		for (const [coin, attribution] of resolved) {
			const list = byPortfolio.get(attribution.portfolioId) ?? [];
			list.push({ coin, attribution });
			byPortfolio.set(attribution.portfolioId, list);
		}

		for (const [portfolioId, coins] of byPortfolio) {
			let investments: OpenInvestment[];
			try {
				investments = await this.poller.fetchOpenInvestments(portfolioId);
			} catch (e: any) {
				this.log({ type: 'error', source: 'fetch_open_investments', portfolioId, isAdHoc: true, message: e.message });
				continue; // retry next cycle - the cache already remembers the resolved attribution, no re-decode needed
			}
			adHocPortfolioIds.add(portfolioId);

			// Ad-hoc (manually-mimicked) portfolios don't support a risk-band
			// override, same as the main followed-portfolio loop above - always
			// the global band for those; a followed portfolio reaching this
			// path (e.g. its investment was stale-ignored on the normal pass)
			// still gets its own override checked.
			const isFollowed = followedPortfolioIds.has(portfolioId);
			const portfolioOverride = riskEntries.find((e) => e.portfolioId === portfolioId);
			const risk = isFollowed ? resolvePortfolioRisk(globalRisk, portfolioOverride).risk : globalRisk;

			for (const { coin, attribution } of coins) {
				const investment = investments.find((inv) => inv.baseId === attribution.investmentBaseId);
				if (!investment) {
					this.log({ type: 'cloid_attributed_investment_not_found', coin, investmentBaseId: attribution.investmentBaseId, portfolioId, detail: 'resolved via cloid but no longer in this portfolio\'s open investments - likely already closed' });
					continue;
				}

				if (ignored[investment.baseId]) {
					this.log({ type: 'cloid_rescued_from_ignored', baseId: investment.baseId, coin, previousReason: ignored[investment.baseId].reason });
					delete ignored[investment.baseId];
				}

				// The coin's only real candidate is the one cloid decoding just
				// confirmed - override investmentsByCoin so openOrAdjust's own
				// (independent) rivals check can't second-guess this with an
				// inconclusive verdict of its own.
				const originalCoinInvestments = investmentsByCoin.get(coin);
				investmentsByCoin.set(coin, [investment]);
				try {
					await this.sync.openOrAdjust(investment.baseId, investment, state, investmentsByCoin, ignored, risk, traderMode, noNewPositions);
				} catch (e: any) {
					this.log({ type: 'error', source: 'cloid_adopt', baseId: investment.baseId, coin, message: e.message });
					continue;
				} finally {
					if (originalCoinInvestments) investmentsByCoin.set(coin, originalCoinInvestments);
					else investmentsByCoin.delete(coin);
				}
				this.stateStore.save(state);
				this.ignoredStore.save(ignored);
			}
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
