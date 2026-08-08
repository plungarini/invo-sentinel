import { randomBytes, randomUUID } from 'crypto';
import type { AssetMeta, HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import { clampLeverage, clampMarginFraction } from '../services/risk-policy.js';
import type { OpenInvestment, PositionStateMap, RiskConfig } from '../types.js';
import { resolveMimickedCandidate } from './mimic-resolver.js';

const MIN_ORDER_USD = 1; // delta below this is dust / rounding noise; no-op, not an order

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
	): Promise<void> {
		const { log, risk, dryRun, hl, invo } = this.opts;
		const coin = investment.ticker;

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

		// Only hit the leverage-update endpoint when it's actually changing ;
		// shaves a round trip off the common case (margin adjustment at
		// unchanged leverage).
		if (!dryRun && (entry.leverage !== leverage || !entry.ourBaseShortId)) {
			await hl.setLeverage(coin, leverage);
		}

		const szDecimals = this.szDecimalsByCoin[coin] ?? 4;
		const isIncrease = deltaMarginUsd > 0;
		const deltaNotionalUsd = Math.abs(deltaMarginUsd) * leverage;
		const deltaSize = parseFloat((deltaNotionalUsd / price).toFixed(szDecimals));

		if (deltaSize <= 0) {
			state[baseId] = { ...entry, leverage, isBuy };
			return;
		}

		// Reducing = opposite-direction order; Hyperliquid nets it against the
		// existing position automatically (same primitive a full close uses,
		// just with a partial size here).
		const orderIsBuy = isIncrease ? isBuy : !isBuy;
		const wasNewPosition = !entry.ourBaseShortId;

		if (dryRun) {
			state[baseId] = {
				coin,
				isBuy,
				leverage,
				marginUsd: targetMarginUsd,
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
				marginUsdAfter: targetMarginUsd,
				wouldOrderSize: deltaSize,
				wouldOrderSide: orderIsBuy ? 'buy' : 'sell',
			});
			return;
		}

		let orderResult: unknown;
		try {
			orderResult = await hl.placeMarketOrder(coin, orderIsBuy, deltaSize.toString());
		} catch (e: any) {
			log({ type: 'error', source: 'hl_order', baseId, coin, message: e.message });
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
			marginUsd: targetMarginUsd,
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
			marginUsdAfter: targetMarginUsd,
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

		const closeResult = await hl.closePosition(entry.coin);
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
