import { randomBytes, randomUUID } from 'crypto';
import { extractAvgFillPrice, orderFillError, type AssetMeta, type HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { InvoClient } from '../clients/invo-client.js';
import type { ClosedTradesStore } from '../services/closed-trades-store.js';
import type { Logger } from '../services/logger.js';
import { clampLeverage, clampMarginFraction } from '../services/risk-policy.js';
import { evaluateStaleEntry, type StaleEntryConfig } from '../services/stale-entry-policy.js';
import type { HyperliquidFill, IgnoredTradesMap, OpenInvestment, PositionStateMap, RiskConfig } from '../types.js';
import { resolveConflictByCloid } from './cloid-attribution.js';

const MIN_ORDER_USD = 1; // delta below this is dust / rounding noise; no-op, not an order
const HL_MIN_NOTIONAL_USD = 10; // exchange-enforced floor; below this HL rejects the order outright

function genBaseShortId(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	const bytes = randomBytes(10);
	let id = '';
	for (const b of bytes) id += chars[b % chars.length];
	return id;
}

export interface PositionSyncOptions {
	hl: HyperliquidClient;
	invo: InvoClient;
	log: Logger;
	staleEntry: StaleEntryConfig;
	dryRun: boolean;
	assetMeta: AssetMeta[];
	/** Memoized per-cycle - conflicts are rare, so this only actually calls HL when one occurs, and at most once per cycle regardless of how many. */
	getFillsOnce: () => Promise<HyperliquidFill[]>;
	/** Durable closed-trade history - written once per real close, so portfolio-level analytics survive both the close and a later unfollow. */
	closedTrades: ClosedTradesStore;
}

/**
 * Owns the actual open/adjust/close decision for a single trade (keyed by
 * the trader's baseId). Everything here is mechanical; no AI, no
 * discretion: given a signal and the current tracked state, it computes
 * exactly one delta order (or none) and executes it. The only guardrail is
 * risk-policy's margin/leverage clamp; nothing is ever skipped for being
 * "too risky"; only resized.
 */
export class PositionSync {
	private assetIndexByCoin: Record<string, number> = {};
	private szDecimalsByCoin: Record<string, number> = {};

	constructor(private opts: PositionSyncOptions) {
		opts.assetMeta.forEach((a, i) => {
			this.assetIndexByCoin[a.name] = i;
			this.szDecimalsByCoin[a.name] = a.szDecimals;
		});
	}

	hasAsset(coin: string): boolean {
		return coin in this.assetIndexByCoin;
	}

	/**
	 * Opens a brand-new tracked trade, adjusts an existing one toward the
	 * trader's current margin %, or auto-adopts / flags a pre-existing real
	 * position it just discovered. Mutates `state` in place; caller persists.
	 * `risk` is per-call, not fixed at construction - the caller resolves
	 * it per-portfolio (see `resolvePortfolioRisk`) since a followed
	 * portfolio may have its own margin-band override.
	 */
	async openOrAdjust(
		baseId: string,
		investment: OpenInvestment,
		state: PositionStateMap,
		investmentsByCoin: Map<string, OpenInvestment[]>,
		ignored: IgnoredTradesMap,
		risk: RiskConfig,
	): Promise<void> {
		const { log, staleEntry, dryRun, hl, invo, getFillsOnce } = this.opts;
		const coin = investment.ticker;

		if (ignored[baseId]) {
			return; // permanently skipped earlier for this investment; logged once already, not spammed every cycle
		}

		if (!this.hasAsset(coin)) {
			log({ type: 'skip', reason: 'unknown coin on Hyperliquid', baseId, coin });
			return;
		}

		// Cheap, synchronous, no network: if this baseId isn't tracked yet and
		// another one already owns this exact coin, there's nothing further
		// worth computing this cycle - bail out before spending any API calls
		// on equity/prices/positions we'd just discard. This daemon's
		// per-baseId delta math assumes a tracked baseId owns the WHOLE real
		// position on a coin, which breaks the moment a second one shares it
		// (whichever opens second would size its order against an assumed
		// margin of $0, stacking on top of / netting against the first one's
		// real, already-tracked exposure) - not currently supported, so this
		// is flagged rather than silently corrupting either entry's margin.
		if (!state[baseId]?.ourBaseShortId) {
			const otherTrackedOnCoin = Object.entries(state).find(([bid, s]) => bid !== baseId && s.coin === coin);
			if (otherTrackedOnCoin) {
				// A conflict alone doesn't excuse this from the same staleness gate
				// a brand-new open would face below - without this, an old entry
				// stuck behind a conflict never ages out of `existing_position_conflict`
				// on its own; it'd get flagged every cycle for as long as the
				// conflict lasts, even long after it's clearly too stale to ever
				// mirror faithfully once the conflict does clear.
				const verdict = evaluateStaleEntry(investment, staleEntry);
				if (verdict.skip && verdict.permanent) {
					ignored[baseId] = {
						coin,
						portfolioId: investment.portfolio?.id,
						reason: `entry is ${verdict.ageMinutes.toFixed(1)}min old (limit ${staleEntry.maxAgeMinutes}min) and conflicts with already-tracked ${otherTrackedOnCoin[0]}; permanently ignored regardless of PnL`,
						ignoredAt: new Date().toISOString(),
					};
					log({
						type: 'stale_entry_ignored',
						baseId,
						coin,
						trader: investment.owner?.username,
						ageMinutes: Number(verdict.ageMinutes.toFixed(1)),
						pnlPct: Number(verdict.pnlPercent.toFixed(2)),
						maxAgeMinutes: staleEntry.maxAgeMinutes,
						note: 'also conflicted with an already-tracked position on this coin',
					});
					return;
				}
				log({
					type: 'existing_position_conflict',
					reason:
						'another tracked baseId already owns this coin; cannot safely track a second one on the same coin at once',
					baseId,
					coin,
					trader: investment.owner?.username,
					alreadyTrackedBaseId: otherTrackedOnCoin[0],
					fix: `resolve/close the existing tracked position (${otherTrackedOnCoin[0]}) first, e.g. npm run close -- ${coin}`,
				});
				return;
			}
		}

		const traderLeverage = investment.leverage ?? 1;
		const leverage = clampLeverage(traderLeverage, risk);
		const isBuy = investment.directionLong === true;
		const rawPercent = typeof investment.entrySize === 'number' ? investment.entrySize : null;
		if (rawPercent == null) {
			log({ type: 'skip', reason: 'no entrySize on signal', baseId, coin });
			return;
		}

		const clampedFraction = clampMarginFraction(rawPercent, risk);
		const [equity, mids] = await Promise.all([hl.getAccountValueUsd(), hl.getAllMids()]);

		const entry = state[baseId] ?? {
			coin,
			isBuy,
			leverage,
			marginUsd: 0,
			ourBaseShortId: '',
			portfolioId: investment.portfolio?.id,
			ownerUsername: investment.owner?.username,
		};

		// The user is always free to open/edit/close positions manually on
		// Hyperliquid directly - this daemon must never crash or fight that.
		// Everything below (delta sizing) is computed purely from our OWN
		// `entry.marginUsd`, never cross-checked against the real exchange
		// position, so a manual edit desyncs that baseline silently unless
		// resynced here first, before any already-tracked baseId's delta is
		// computed. Two cases:
		//  - No real position at all → the user closed it manually while the
		//    trader's own signal is still open. Respect that as a deliberate
		//    stop-managing instruction: permanently ignore this baseId
		//    rather than silently reopening it next cycle (which is exactly
		//    what would otherwise happen - a fresh, empty `entry` cycling
		//    right back through the brand-new-open path).
		//  - Real position exists but its size (or direction) has changed
		//    manually → resync `entry.marginUsd` to the REAL live size
		//    before computing the delta, so the next order moves from where
		//    the position actually is, not from a stale internal guess.
		if (entry.ourBaseShortId) {
			const livePositions = await hl.getPositions();
			const realPosition = livePositions.find((p) => p.coin === coin && parseFloat(p.szi) !== 0);
			if (!realPosition) {
				ignored[baseId] = {
					coin,
					portfolioId: investment.portfolio?.id,
					reason: 'tracked position has no matching real HL position anymore - closed manually or externally; permanently stopping management of this specific trade rather than silently reopening it',
					ignoredAt: new Date().toISOString(),
				};
				delete state[baseId];
				this.opts.closedTrades.record({
					baseId,
					coin,
					isBuy: entry.isBuy,
					leverage: entry.leverage,
					marginUsd: entry.marginUsd,
					portfolioId: entry.portfolioId,
					portfolioTitle: investment.portfolio?.title,
					ownerUsername: entry.ownerUsername,
					entryPrice: entry.entryPrice,
					openedAt: entry.openedAt,
					closedAt: new Date().toISOString(),
					closeReason: 'manual_close_detected',
				});
				log({
					type: 'manual_close_detected',
					baseId,
					coin,
					trader: investment.owner?.username,
					detail: 'no real HL position found for an already-tracked baseId; assuming manual/external close, will not reopen',
				});
				return;
			}
			const realDirectionMatches = parseFloat(realPosition.szi) > 0 === entry.isBuy;
			if (!realDirectionMatches) {
				ignored[baseId] = {
					coin,
					portfolioId: investment.portfolio?.id,
					reason: `real HL position direction (${parseFloat(realPosition.szi) > 0 ? 'long' : 'short'}) no longer matches tracked direction (${entry.isBuy ? 'long' : 'short'}) - manual intervention detected; permanently stopping management of this specific trade`,
					ignoredAt: new Date().toISOString(),
				};
				delete state[baseId];
				this.opts.closedTrades.record({
					baseId,
					coin,
					isBuy: entry.isBuy,
					leverage: entry.leverage,
					marginUsd: entry.marginUsd,
					portfolioId: entry.portfolioId,
					portfolioTitle: investment.portfolio?.title,
					ownerUsername: entry.ownerUsername,
					entryPrice: entry.entryPrice,
					openedAt: entry.openedAt,
					closedAt: new Date().toISOString(),
					closeReason: 'manual_direction_change_detected',
				});
				log({
					type: 'manual_direction_change_detected',
					baseId,
					coin,
					trader: investment.owner?.username,
					trackedDirection: entry.isBuy ? 'long' : 'short',
					realDirection: parseFloat(realPosition.szi) > 0 ? 'long' : 'short',
				});
				return;
			}
			const realPrice = parseFloat(mids[coin]);
			if (realPrice && entry.leverage) {
				const realMarginUsd = (Math.abs(parseFloat(realPosition.szi)) * realPrice) / entry.leverage;
				if (Math.abs(realMarginUsd - entry.marginUsd) >= MIN_ORDER_USD) {
					log({
						type: 'resynced_to_live_position',
						baseId,
						coin,
						trader: investment.owner?.username,
						trackedMarginUsd: entry.marginUsd,
						realMarginUsd,
						detail: 'real HL position size no longer matched tracked margin - resynced before computing this cycle\'s delta',
					});
					// Adopting the real size here is now genuinely final, not a
					// staging step toward re-chasing an absolute trader-%
					// target - see the fractionDelta targeting below, which
					// only reacts to the TRADER's own % actually changing, so
					// a manual top-up/reduce this resync just picked up is
					// left exactly as the user placed it.
					entry.marginUsd = realMarginUsd;
				}
			}
		}

		// No other tracked baseId owns this coin. There may still be a REAL,
		// untracked position on it that pre-dates the daemon - wrong
		// direction vs. it → definitely not this one, skip quietly (some
		// other baseId may still be the right one this cycle). Right
		// direction, and no other followed trader shares both this coin and
		// this direction → unambiguous, auto-adopt immediately. Right
		// direction, but another followed trader shares it too → decode the
		// position's own order cloid (cloid-attribution.ts) to know exactly
		// which one, instead of guessing. Only flag it if that's inconclusive.
		if (!entry.ourBaseShortId) {
			const livePositions = await hl.getPositions();
			const existing = livePositions.find((p) => p.coin === coin && parseFloat(p.szi) !== 0);
			if (existing) {
				const directionMatches = parseFloat(existing.szi) > 0 === isBuy;

				if (!directionMatches) {
					log({
						type: 'skip',
						reason: 'untracked live position on this coin is the OPPOSITE direction; not this trade',
						baseId,
						coin,
						liveSize: existing.szi,
					});
					return;
				}

				const sameDirectionRivals = (investmentsByCoin.get(coin) ?? []).filter(
					(c) => c.baseId !== baseId && c.directionLong === investment.directionLong,
				);

				let adopt = sameDirectionRivals.length === 0;

				if (!adopt) {
					const fills = await getFillsOnce();
					const resolvedBaseId = resolveConflictByCloid(fills, coin, [investment, ...sameDirectionRivals]);
					if (resolvedBaseId === baseId) {
						adopt = true;
						log({ type: 'conflict_resolved_by_cloid', baseId, coin });
					} else if (resolvedBaseId) {
						log({
							type: 'skip',
							reason: "this wallet's own order cloid decodes to a different baseId owning this position",
							baseId,
							coin,
							resolvedBaseId,
						});
						return;
					} else {
						const verdict = evaluateStaleEntry(investment, staleEntry);
						if (verdict.skip && verdict.permanent) {
							ignored[baseId] = {
								coin,
								portfolioId: investment.portfolio?.id,
								reason: `entry is ${verdict.ageMinutes.toFixed(1)}min old (limit ${staleEntry.maxAgeMinutes}min) and cloid decoding couldn't confirm it owns this coin; permanently ignored regardless of PnL`,
								ignoredAt: new Date().toISOString(),
							};
							log({
								type: 'stale_entry_ignored',
								baseId,
								coin,
								trader: investment.owner?.username,
								ageMinutes: Number(verdict.ageMinutes.toFixed(1)),
								pnlPct: Number(verdict.pnlPercent.toFixed(2)),
								maxAgeMinutes: staleEntry.maxAgeMinutes,
								note: 'also an inconclusive same-coin conflict with another followed trader',
							});
							return;
						}
						log({
							type: 'existing_position_conflict',
							reason:
								"multiple followed traders hold this coin in the same direction and this wallet's own order cloid could not confirm which one (no decodable Invo cloid on any recent fill for this coin)",
							baseId,
							coin,
							trader: investment.owner?.username,
							liveSize: existing.szi,
							rivalCount: sameDirectionRivals.length,
							fix: `npm run adopt -- ${baseId} ${coin} ${isBuy ? 'long' : 'short'} ${leverage} <yourMarginUsd>; or close it manually`,
						});
						return;
					}
				}

				if (adopt) {
					const price = parseFloat(mids[coin]);
					const liveSize = Math.abs(parseFloat(existing.szi));
					entry.marginUsd = price && leverage ? (liveSize * price) / leverage : 0;
					entry.ourBaseShortId = genBaseShortId();
					entry.leverage = leverage;
					entry.isBuy = isBuy;
					entry.entryPrice = price || undefined;
					entry.openedAt = new Date().toISOString();
					state[baseId] = { ...entry };
					log({
						type: 'auto_adopted',
						baseId,
						coin,
						trader: investment.owner?.username,
						liveSize: existing.szi,
						adoptedMarginUsd: entry.marginUsd,
					});
				}
			}
		}

		// Still no real position to adopt - this would be a genuinely brand
		// new order. Gate it on freshness: past maxAgeMinutes, permanently
		// refuse regardless of current PnL (a same-coin conflict clearing
		// months after the fact doesn't make an old trade idea fresh again).
		// Within the fresh window but already up more than maxProfitPct,
		// refuse for now, but only for now - re-evaluated next cycle.
		if (!entry.ourBaseShortId) {
			const verdict = evaluateStaleEntry(investment, staleEntry);
			if (verdict.skip) {
				if (verdict.permanent) {
					ignored[baseId] = {
						coin,
						portfolioId: investment.portfolio?.id,
						reason: `entry is ${verdict.ageMinutes.toFixed(1)}min old (limit ${staleEntry.maxAgeMinutes}min); permanently ignored regardless of PnL`,
						ignoredAt: new Date().toISOString(),
					};
					log({
						type: 'stale_entry_ignored',
						baseId,
						coin,
						trader: investment.owner?.username,
						ageMinutes: Number(verdict.ageMinutes.toFixed(1)),
						pnlPct: Number(verdict.pnlPercent.toFixed(2)),
						maxAgeMinutes: staleEntry.maxAgeMinutes,
					});
				} else {
					log({
						type: 'fresh_entry_profit_skip',
						baseId,
						coin,
						trader: investment.owner?.username,
						ageMinutes: Number(verdict.ageMinutes.toFixed(1)),
						pnlPct: Number(verdict.pnlPercent.toFixed(2)),
						maxProfitPct: staleEntry.maxProfitPct,
						note: 'temporary - still within the fresh window; reconsidered next cycle',
					});
				}
				return;
			}
		}

		// Target is the CURRENT (possibly just-resynced/adopted) margin plus
		// only the CHANGE in the trader's own fraction since we last acted -
		// never an absolute clampedFraction*equity target recomputed from
		// scratch every cycle. That absolute-target approach actively fought
		// any manual top-up/reduce the user made directly on the exchange:
		// resync would adopt the user's real (larger or smaller) size as the
		// new baseline, then the very same cycle immediately "corrected" it
		// right back toward the trader's unchanged % - silently undoing the
		// user's own manual action and realizing a real loss on the round
		// trip (confirmed live 2026-08-12 on ARB/XRP; see INCIDENT_LOG.md).
		// A brand-new open or a just-auto-adopted position has no prior
		// fraction to diff against (lastAppliedFraction is unset) - that
		// first cycle still targets the full absolute amount, same as
		// before; every cycle after tracks only the trader-driven delta.
		// `priorFraction` is read once into a local rather than mutating
		// `entry` directly - entry can be a live reference into `state`, and
		// this fraction must not land in `state[baseId]` unless a real
		// order actually executes (or the position is confirmed dust-close,
		// both handled explicitly below); otherwise a failed order attempt
		// would silently mark this fraction "already applied" with no order
		// ever having moved marginUsd to match.
		const priorFraction = entry.lastAppliedFraction;
		const isFirstEverEvaluation = priorFraction == null;
		const fractionDelta = isFirstEverEvaluation ? clampedFraction : clampedFraction - priorFraction;
		const targetMarginUsd = isFirstEverEvaluation ? clampedFraction * equity : entry.marginUsd + fractionDelta * equity;
		// Only a first-ever evaluation commits the baseline unconditionally
		// (even with no order needed - dust-matches-target on adopt still
		// starts incremental tracking). An already-tracked position's
		// pending sub-$1 delta is left uncommitted so it keeps accumulating
		// across cycles instead of being silently dropped (mirrors
		// entry.marginUsd itself, only updated once an order executes).
		const fractionToPersistIfNoOrder = isFirstEverEvaluation ? clampedFraction : priorFraction;

		const deltaMarginUsd = targetMarginUsd - entry.marginUsd;
		if (Math.abs(deltaMarginUsd) < MIN_ORDER_USD) {
			state[baseId] = { ...entry, leverage, isBuy, lastAppliedFraction: fractionToPersistIfNoOrder };
			return; // steady-state common case every cycle; no log spam
		}

		const price = parseFloat(mids[coin]);
		if (!price) {
			log({ type: 'skip', reason: 'no live price for coin', baseId, coin });
			return;
		}

		const wasNewPosition = !entry.ourBaseShortId;
		const szDecimals = this.szDecimalsByCoin[coin] ?? 4;
		const isIncrease = deltaMarginUsd > 0;
		let deltaNotionalUsd = Math.abs(deltaMarginUsd) * leverage;

		// HL enforces a hard $10 minimum order notional and rejects anything
		// below it outright - checked BEFORE attempting anything, so a
		// doomed-to-fail order never actually hits the exchange.
		if (deltaNotionalUsd < HL_MIN_NOTIONAL_USD) {
			if (wasNewPosition && isIncrease) {
				// Bump a brand-new open up to the floor, with a small buffer - 
				// rounding deltaSize to szDecimals can otherwise undershoot
				// back below $10 and get rejected right back (seen live: a
				// $10.00 target rounded down to $9.997).
				deltaNotionalUsd = HL_MIN_NOTIONAL_USD * 1.02;
			} else {
				// An already-tracked position's top-up (or a reduce) landing
				// below the floor genuinely cannot be placed at all - HL
				// would reject it identically every cycle. Leave it for next
				// cycle, when targetMarginUsd has drifted further from
				// entry.marginUsd, instead of hammering the exchange with a
				// guaranteed-rejected order every poll.
				state[baseId] = { ...entry, leverage, isBuy, lastAppliedFraction: fractionToPersistIfNoOrder };
				return;
			}
		}

		// Only hit the leverage-update endpoint when it's actually changing ;
		// shaves a round trip off the common case (margin adjustment at
		// unchanged leverage).
		if (!dryRun && (entry.leverage !== leverage || wasNewPosition)) {
			await hl.setLeverage(coin, leverage);
		}

		const deltaSize = parseFloat((deltaNotionalUsd / price).toFixed(szDecimals));

		if (deltaSize <= 0) {
			state[baseId] = { ...entry, leverage, isBuy, lastAppliedFraction: fractionToPersistIfNoOrder };
			return;
		}

		// Reducing = opposite-direction order; Hyperliquid nets it against the
		// existing position automatically (same primitive a full close uses,
		// just with a partial size here).
		const orderIsBuy = isIncrease ? isBuy : !isBuy;

		// The margin this order actually moves, computed from the real
		// (rounded, possibly floor-bumped) order size rather than the
		// pre-rounding target, so tracked state matches what actually executes.
		const actualDeltaMarginUsd = (deltaSize * price) / leverage;
		const finalMarginUsd = entry.marginUsd + (isIncrease ? actualDeltaMarginUsd : -actualDeltaMarginUsd);

		if (dryRun) {
			state[baseId] = {
				coin,
				isBuy,
				leverage,
				marginUsd: finalMarginUsd,
				lastAppliedFraction: clampedFraction,
				ourBaseShortId: entry.ourBaseShortId || 'DRYRUN',
				portfolioId: investment.portfolio?.id,
				ownerUsername: investment.owner?.username,
				entryPrice: entry.entryPrice ?? (wasNewPosition ? price : undefined),
				openedAt: entry.openedAt ?? (wasNewPosition ? new Date().toISOString() : undefined),
			};
			log({
				type: 'dry_run_' + (wasNewPosition ? 'open' : isIncrease ? 'increase' : 'reduce'),
				baseId,
				coin,
				side: isBuy ? 'long' : 'short',
				leverage,
				traderLeverage,
				trader: investment.owner?.username,
				traderPercent: rawPercent,
				clampedPercent: clampedFraction * 100,
				marginUsdBefore: entry.marginUsd,
				marginUsdAfter: finalMarginUsd,
				wouldOrderSize: deltaSize,
				wouldOrderSide: orderIsBuy ? 'buy' : 'sell',
			});
			return;
		}

		let orderResult: unknown;
		try {
			orderResult = await hl.placeMarketOrder(coin, orderIsBuy, deltaSize.toString(), szDecimals);
		} catch (e: any) {
			log({ type: 'error', source: 'hl_order', baseId, coin, message: e.message });
			return;
		}

		// HL responds 200 OK even when it rejected the order outright (e.g. an
		// invalid price); the real outcome is nested in the response body.
		// Trusting an unfilled order here would tag state/Invo as opened when
		// nothing actually happened on the exchange - leave both untouched so
		// the same delta gets retried, unchanged, next cycle.
		const fillError = orderFillError(orderResult);
		if (fillError) {
			log({
				type: 'order_rejected',
				source: 'hl_order',
				baseId,
				coin,
				message: fillError,
				deltaSize,
				notionalUsd: deltaSize * price,
				hlResult: orderResult,
			});
			return;
		}

		let ourBaseShortId = entry.ourBaseShortId;
		let invoResult: any = null;

		if (wasNewPosition) {
			// recordClose's `baseShortId` is confirmed <=10 characters (live
			// evidence: sending recordOpen's server-assigned UUID got a 400
			// "Too big: expected string to have <=10 characters" - ruling that
			// out definitively). A client-generated 10-char id was tried first
			// and got 404 NOT_FOUND (right format, but Invo never learned that
			// specific value - recordOpen's schema hard-rejects a client-
			// supplied baseShortId outright). The trader's OWN
			// investment.baseShortId is the one remaining 10-char-format
			// candidate available, and it's exactly what Invo's own
			// /dex/trade mimic-tracking is keyed by - next best-evidenced
			// guess, not yet confirmed either way.
			ourBaseShortId = investment.baseShortId;
			try {
				invoResult = await invo.recordOpen({
					clientTxId: randomUUID(),
					coin,
					assetIndex: this.assetIndexByCoin[coin],
					entry: { side: isBuy ? 'long' : 'short', marginMode: 'isolated', leverage, tpPx: null, slPx: null },
					submission: { hlOrder: orderResult, nonceMs: Date.now(), hlResponse: orderResult },
					summary: { qtyBefore: '0', qtyAfter: deltaSize.toString(), intendedLeverage: leverage },
					mimicMeta: {
						portfolioId: investment.portfolio?.id ?? randomUUID(),
						creatorInvoUserId: investment.owner?.id ?? randomUUID(),
						initialSourcePaperUpdateId: baseId,
						sourcePaperTradeBaseId: baseId,
					},
				});
			} catch (e: any) {
				invoResult = { error: e.message };
			}
		}

		state[baseId] = {
			coin,
			isBuy,
			leverage,
			marginUsd: finalMarginUsd,
			lastAppliedFraction: clampedFraction,
			ourBaseShortId,
			portfolioId: investment.portfolio?.id,
			ownerUsername: investment.owner?.username,
			entryPrice: entry.entryPrice ?? (wasNewPosition ? extractAvgFillPrice(orderResult) ?? price : undefined),
			openedAt: entry.openedAt ?? (wasNewPosition ? new Date().toISOString() : undefined),
		};

		log({
			type: wasNewPosition ? 'opened' : isIncrease ? 'increased' : 'reduced',
			baseId,
			coin,
			side: isBuy ? 'long' : 'short',
			leverage,
			traderLeverage,
			trader: investment.owner?.username,
			traderPercent: rawPercent,
			clampedPercent: clampedFraction * 100,
			marginUsdBefore: entry.marginUsd,
			marginUsdAfter: finalMarginUsd,
			orderSize: deltaSize,
			orderSide: orderIsBuy ? 'buy' : 'sell',
			hlResult: orderResult,
			invoResult,
		});
	}

	/** Fully mirrors a close; always, never clamped. `portfolioTitle` is a point-in-time snapshot for the durable closed-trade record - state itself never stores it, only `portfolioId`. */
	async close(baseId: string, state: PositionStateMap, portfolioTitle?: string): Promise<void> {
		const { log, dryRun, hl, invo, closedTrades } = this.opts;
		const entry = state[baseId];
		if (!entry) return; // caller already knows it's tracked; defensive only

		const recordClosedTrade = (closingPrice: number | null, closeReason: string) =>
			closedTrades.record({
				baseId,
				coin: entry.coin,
				isBuy: entry.isBuy,
				leverage: entry.leverage,
				marginUsd: entry.marginUsd,
				portfolioId: entry.portfolioId,
				portfolioTitle,
				ownerUsername: entry.ownerUsername,
				entryPrice: entry.entryPrice,
				closingPrice: closingPrice ?? undefined,
				openedAt: entry.openedAt,
				closedAt: new Date().toISOString(),
				closeReason,
			});

		const positions = await hl.getPositions();
		const pos = positions.find((p) => p.coin === entry.coin);
		if (!pos) {
			log({ type: 'skip_close', reason: 'no open HL position for this coin', baseId, coin: entry.coin });
			recordClosedTrade(null, 'skip_close_no_real_position');
			delete state[baseId];
			return;
		}
		const qtyBefore = pos.szi;

		if (dryRun) {
			log({ type: 'dry_run_close', baseId, coin: entry.coin, trader: entry.ownerUsername, qtyBefore });
			delete state[baseId];
			return;
		}

		const szDecimals = this.szDecimalsByCoin[entry.coin] ?? 4;
		const closeResult = await hl.closePosition(entry.coin, szDecimals);

		// Same trap as opens: a 200 OK can still mean the exchange rejected
		// the order. If it did, the real position is still open - do NOT
		// drop tracking for it, or it'll be silently forgotten while still
		// live on the wallet.
		const fillError = orderFillError(closeResult);
		if (fillError) {
			log({ type: 'order_rejected', source: 'hl_close', baseId, coin: entry.coin, message: fillError, hlResult: closeResult });
			return;
		}

		let invoResult: any = null;
		try {
			invoResult = await invo.recordClose({
				clientTxId: randomUUID(),
				baseShortId: entry.ourBaseShortId,
				assetIndex: this.assetIndexByCoin[entry.coin],
				submission: { hlOrder: closeResult, nonceMs: Date.now(), hlResponse: closeResult },
				summary: { qtyBefore, qtyAfter: '0' },
			});
		} catch (e: any) {
			invoResult = { error: e.message };
		}
		log({
			type: 'closed',
			baseId,
			coin: entry.coin,
			trader: entry.ownerUsername,
			qtyBefore,
			hlResult: closeResult,
			invoResult,
		});
		recordClosedTrade(extractAvgFillPrice(closeResult), 'closed');
		delete state[baseId];
	}
}
