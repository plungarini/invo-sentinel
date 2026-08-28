import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import { computeEntrySim, computeEquityFraction, isTraderModeActive } from '../services/trader-mode-policy.js';
import type { PositionState, TraderModeConfig } from '../types.js';

export interface TraderModeSyncOptions {
	invo: InvoClient;
	log: Logger;
	dryRun: boolean;
}

export interface TraderModeMirrorResult {
	traderModeInvoBaseId?: string;
	traderModeEntrySim?: number;
}

/**
 * Mirrors Sentinel's own open/adjust/close actions onto a separate Invo
 * portfolio (Trader mode - see TraderModeConfig, docs/research/trader-mode-spike.md)
 * as a paper-traded trade idea. Purely a best-effort side effect: every
 * method here catches its own errors and treats Invo's own `success:false`
 * (a 200 OK the API can still return, e.g. under its minimum sim-position
 * size) as a loggable failure, never a thrown error - this must never block,
 * retry, or influence the real trade it's mirroring.
 */
export class TraderModeSync {
	constructor(private opts: TraderModeSyncOptions) {}

	async mirrorOpen(
		baseId: string,
		entry: PositionState,
		config: TraderModeConfig,
		equity: number,
		leverage: number,
	): Promise<TraderModeMirrorResult> {
		if (!isTraderModeActive(config)) return {};
		const { invo, log, dryRun } = this.opts;
		const equityFraction = computeEquityFraction(entry.marginUsd, equity);

		if (dryRun) {
			log({ type: 'dry_run_trader_mode_open', baseId, coin: entry.coin, portfolioId: config.portfolioId, equityFractionPct: equityFraction * 100, entrySim: computeEntrySim(equityFraction) });
			return {};
		}

		try {
			const entrySim = computeEntrySim(equityFraction);
			const result = await invo.createTickerInvestment({
				ticker: entry.coin,
				portfolioId: config.portfolioId!,
				directionLong: entry.isBuy,
				entrySim,
				priceTarget: null,
				stopLoss: null,
				leverage,
				liquidationPrice: null,
			});
			if (!result.success || !result.baseIds?.length) {
				log({ type: 'trader_mode_mirror_failed', action: 'open', baseId, coin: entry.coin, entrySim, reason: result.error?.msg ?? 'unknown' });
				return {};
			}
			const invoBaseId = result.baseIds[0];
			log({ type: 'trader_mode_mirrored', action: 'open', baseId, coin: entry.coin, invoBaseId, entrySim });
			if (config.autoShare) await this.repost(baseId, invoBaseId, config, false);
			return { traderModeInvoBaseId: invoBaseId, traderModeEntrySim: entrySim };
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_mirror_open', baseId, coin: entry.coin, message: e.message });
			return {};
		}
	}

	async mirrorAdjust(baseId: string, entry: PositionState, config: TraderModeConfig, equity: number): Promise<TraderModeMirrorResult> {
		if (!isTraderModeActive(config)) return {};
		if (!entry.traderModeInvoBaseId) {
			// Trader mode wasn't active (or the original mirror attempt failed)
			// when this position was first opened - nothing to incrementally
			// resize, so bootstrap it as a fresh mirrored open at the CURRENT
			// size instead of silently never mirroring this trade at all.
			return this.mirrorOpen(baseId, entry, config, equity, entry.leverage);
		}
		const { invo, log, dryRun } = this.opts;
		const equityFraction = computeEquityFraction(entry.marginUsd, equity);

		if (dryRun) {
			log({ type: 'dry_run_trader_mode_adjust', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId, equityFractionPct: equityFraction * 100, targetEntrySim: computeEntrySim(equityFraction), priorEntrySim: entry.traderModeEntrySim ?? 0 });
			return {};
		}

		try {
			const targetEntrySim = computeEntrySim(equityFraction);
			const priorEntrySim = entry.traderModeEntrySim ?? 0;
			const simDifference = Math.abs(targetEntrySim - priorEntrySim);
			if (simDifference < 0.0001) return {}; // dust; not worth a call
			const simIncrease = targetEntrySim > priorEntrySim;
			const result = await invo.modifyTickerInvestment({
				baseId: entry.traderModeInvoBaseId,
				name: null,
				willAutoClose: true,
				simDifference,
				simIncrease,
				directionLong: null,
				priceTarget: null,
				priceTargetCurrency: null,
				stopLoss: null,
				liquidationPrice: null,
				holdTimeUnit: null,
				minHoldTime: null,
				maxHoldTime: null,
				notes: null,
			});
			if (!result.success) {
				log({ type: 'trader_mode_mirror_failed', action: 'modify', baseId, coin: entry.coin, simDifference, simIncrease, reason: result.error?.msg ?? 'unknown' });
				return {};
			}
			log({ type: 'trader_mode_mirrored', action: 'modify', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId, simDifference, simIncrease });
			if (config.autoShare) await this.repost(baseId, entry.traderModeInvoBaseId, config, true);
			return { traderModeEntrySim: targetEntrySim };
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_mirror_adjust', baseId, coin: entry.coin, message: e.message });
			return {};
		}
	}

	async mirrorClose(baseId: string, entry: PositionState, config: TraderModeConfig, closingPrice: number | null): Promise<void> {
		if (!isTraderModeActive(config) || !entry.traderModeInvoBaseId) return;
		const { invo, log, dryRun } = this.opts;

		if (dryRun) {
			log({ type: 'dry_run_trader_mode_close', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId });
			return;
		}

		try {
			const result = await invo.sellInvestment({ baseId: entry.traderModeInvoBaseId, customClosingPrice: closingPrice });
			if (!result.success) {
				log({ type: 'trader_mode_mirror_failed', action: 'close', baseId, coin: entry.coin, reason: result.error?.msg ?? 'unknown' });
				return;
			}
			log({ type: 'trader_mode_mirrored', action: 'close', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId });
			if (config.autoShare) await this.repost(baseId, entry.traderModeInvoBaseId, config, true);
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_mirror_close', baseId, coin: entry.coin, message: e.message });
		}
	}

	private async repost(baseId: string, invoBaseId: string, config: TraderModeConfig, isUpdate: boolean): Promise<void> {
		const { invo, log } = this.opts;
		try {
			const result = await invo.repostInvestment({
				baseId: invoBaseId,
				userTags: null,
				// `content` appears optional on Invo's own side - sent as '' rather
				// than omitted, since every observed real call included the field.
				content: config.caption ?? '',
				isUpdate,
				isPrivateIfUserPrivate: true,
				showUpdateChanges: null,
				inMonetizePackage: null,
			});
			if (!result.success) log({ type: 'trader_mode_repost_failed', baseId, invoBaseId, reason: result.error ?? 'unknown' });
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_repost', baseId, invoBaseId, message: e.message });
		}
	}
}
