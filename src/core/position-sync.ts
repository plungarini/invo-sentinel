import { randomBytes, randomUUID } from 'crypto';
import { orderFillError, type AssetMeta, type HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import { clampLeverage, clampMarginFraction } from '../services/risk-policy.js';
import { evaluateStaleEntry, type StaleEntryConfig } from '../services/stale-entry-policy.js';
import type { IgnoredTradesMap, OpenInvestment, PositionStateMap, RiskConfig } from '../types.js';
import { resolveMimickedCandidate } from './mimic-resolver.js';

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
	risk: RiskConfig;
	staleEntry: StaleEntryConfig;
	dryRun: boolean;
	assetMeta: AssetMeta[];
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
	 */
	async openOrAdjust(
		baseId: string,
		investment: OpenInvestment,
		state: PositionStateMap,
		investmentsByCoin: Map<string, OpenInvestment[]>,
		ignored: IgnoredTradesMap,
	): Promise<void> {
		const { log, risk, staleEntry, dryRun, hl, invo } = this.opts;
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
		// worth computing this cycle — bail out before spending any API calls
		// on equity/prices/positions we'd just discard. This daemon's
		// per-baseId delta math assumes a tracked baseId owns the WHOLE real
		// position on a coin, which breaks the moment a second one shares it
		// (whichever opens second would size its order against an assumed
		// margin of $0, stacking on top of / netting against the first one's
		// real, already-tracked exposure) — not currently supported, so this
		// is flagged rather than silently corrupting either entry's margin.
		if (!state[baseId]?.ourBaseShortId) {
			const otherTrackedOnCoin = Object.entries(state).find(([bid, s]) => bid !== baseId && s.coin === coin);
			if (otherTrackedOnCoin) {
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
		const targetMarginUsd = clampedFraction * equity;

		const entry = state[baseId] ?? {
			coin,
			isBuy,
			leverage,
			marginUsd: 0,
			ourBaseShortId: '',
			portfolioId: investment.portfolio?.id,
			ownerUsername: investment.owner?.username,
		};

		// No other tracked baseId owns this coin. There may still be a REAL,
		// untracked position on it that pre-dates the daemon — wrong
		// direction vs. it → definitely not this one, skip quietly (some
		// other baseId may still be the right one this cycle). Right
		// direction, and no other followed trader shares both this coin and
		// this direction → unambiguous, auto-adopt immediately. Right
		// direction, but another followed trader shares it too → ask Invo's
		// own mimic-tracking (mimic-resolver.ts) which trade you actually
		// mimicked, instead of guessing. Only flag it if that's inconclusive.
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
					const resolution = await resolveMimickedCandidate(invo, [investment, ...sameDirectionRivals]);
					if (resolution.resolvedBaseId === baseId) {
						adopt = true;
						log({ type: 'conflict_resolved', baseId, coin, reason: resolution.reason });
					} else if (resolution.resolvedBaseId) {
						log({
							type: 'skip',
							reason: 'Invo mimic-tracking confirms a different baseId owns this position',
							baseId,
							coin,
							resolvedBaseId: resolution.resolvedBaseId,
						});
						return;
					} else {
						log({
							type: 'existing_position_conflict',
							reason: `multiple followed traders hold this coin in the same direction and mimic-tracking couldn't confirm one (${resolution.reason})`,
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

		// Still no real position to adopt — this would be a genuinely brand
		// new order. Gate it on freshness: past maxAgeMinutes, permanently
		// refuse regardless of current PnL (a same-coin conflict clearing
		// months after the fact doesn't make an old trade idea fresh again).
		// Within the fresh window but already up more than maxProfitPct,
		// refuse for now, but only for now — re-evaluated next cycle.
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
						note: 'temporary — still within the fresh window; reconsidered next cycle',
					});
				}
				return;
			}
		}

		const deltaMarginUsd = targetMarginUsd - entry.marginUsd;
		if (Math.abs(deltaMarginUsd) < MIN_ORDER_USD) {
			state[baseId] = { ...entry, leverage, isBuy };
			return; // steady-state common case every cycle; no log spam
		}

		const price = parseFloat(mids[coin]);
		if (!price) {
			log({ type: 'skip', reason: 'no live price for coin', baseId, coin });
			return;
		}

		const wasNewPosition = !entry.ourBaseShortId;

		// Only hit the leverage-update endpoint when it's actually changing ;
		// shaves a round trip off the common case (margin adjustment at
		// unchanged leverage).
		if (!dryRun && (entry.leverage !== leverage || wasNewPosition)) {
			await hl.setLeverage(coin, leverage);
		}

		const szDecimals = this.szDecimalsByCoin[coin] ?? 4;
		const isIncrease = deltaMarginUsd > 0;
		let deltaNotionalUsd = Math.abs(deltaMarginUsd) * leverage;

		// HL enforces a hard $10 minimum order notional and rejects anything
		// below it outright. Only bump a brand-new open up to the floor — an
		// established position's incremental top-up landing below $10 is
		// fine to just skip this cycle (targetMarginUsd keeps drifting, so it
		// typically crosses the floor on its own); forcing every small
		// top-up to $10 would inflate margin well past the intended band.
		if (wasNewPosition && isIncrease && deltaNotionalUsd < HL_MIN_NOTIONAL_USD) {
			deltaNotionalUsd = HL_MIN_NOTIONAL_USD;
		}

		const deltaSize = parseFloat((deltaNotionalUsd / price).toFixed(szDecimals));

		if (deltaSize <= 0) {
			state[baseId] = { ...entry, leverage, isBuy };
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
				ourBaseShortId: entry.ourBaseShortId || 'DRYRUN',
				portfolioId: investment.portfolio?.id,
				ownerUsername: investment.owner?.username,
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
		// nothing actually happened on the exchange — leave both untouched so
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
			ourBaseShortId = genBaseShortId();
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
			ourBaseShortId,
			portfolioId: investment.portfolio?.id,
			ownerUsername: investment.owner?.username,
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

	/** Fully mirrors a close; always, never clamped. */
	async close(baseId: string, state: PositionStateMap): Promise<void> {
		const { log, dryRun, hl, invo } = this.opts;
		const entry = state[baseId];
		if (!entry) return; // caller already knows it's tracked; defensive only

		const positions = await hl.getPositions();
		const pos = positions.find((p) => p.coin === entry.coin);
		if (!pos) {
			log({ type: 'skip_close', reason: 'no open HL position for this coin', baseId, coin: entry.coin });
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
		// the order. If it did, the real position is still open — do NOT
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
		delete state[baseId];
	}
}
