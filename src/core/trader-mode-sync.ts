import type { InvoClient } from '../clients/invo-client.js';
import type { Logger } from '../services/logger.js';
import { computeEntrySim, computeEquityFraction, extractSimInvestment, isTraderModeActive } from '../services/trader-mode-policy.js';
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

const REPOST_RETRY_DELAY_MS = 2_000;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Invo silently no-ops a repost whose caption is empty/whitespace (confirmed
// live in its own web composer 2026-08-28) - a single zero-width space is the
// smallest content that still publishes, appearing as a post with no visible
// text.
const EMPTY_CAPTION_FALLBACK = '\u200B';

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
				const reason = result.error?.msg ?? 'unknown';
				// A stale orphan sim on this coin (a prior mirror-close that never
				// landed) makes every subsequent open fail like this forever -
				// try to re-attach to that existing sim instead of giving up.
				if (/already exists/i.test(reason)) {
					const recovered = await this.recoverExistingMirror(entry.coin, config);
					if (recovered) {
						// The orphan's real size is whatever was left over from
						// whatever it was before - not the size we just tried
						// to open with. Trusting `entrySim` here would silently
						// mislabel this baseline exactly like the bug this same
						// resync pattern fixes elsewhere in this file.
						log({ type: 'trader_mode_mirror_open_recovered', baseId, coin: entry.coin, invoBaseId: recovered.baseId, requestedEntrySim: entrySim, realEntrySim: recovered.entrySim });
						return { traderModeInvoBaseId: recovered.baseId, traderModeEntrySim: recovered.entrySim ?? entrySim };
					}
				}
				log({ type: 'trader_mode_mirror_failed', action: 'open', baseId, coin: entry.coin, entrySim, reason });
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
			this.opts.log({ type: 'trader_mode_adjust_bootstrapping_open', baseId, coin: entry.coin, detail: 'no mirrored Invo trade on record for this position; opening one now at current size' });
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
			// A prior modify can silently apply a different amount than
			// requested even on `success: true` (confirmed live 2026-08-31:
			// our own tracked value read 1.16%, Invo's real ledger read
			// 1.43% for the same open position) - resyncing against Invo's
			// own ledger here is what the real-HL-position resync
			// (position-sync.ts) already does for the exact same reason.
			// Falls back to our own tracked value only when the read fails,
			// so a transient API error doesn't block the resize itself.
			const realEntrySim = await this.fetchRealEntrySim(entry.traderModeInvoBaseId, config);
			const priorEntrySim = realEntrySim ?? entry.traderModeEntrySim ?? 0;
			if (realEntrySim != null && Math.abs(realEntrySim - (entry.traderModeEntrySim ?? 0)) >= 0.01) {
				log({
					type: 'trader_mode_resynced',
					baseId,
					coin: entry.coin,
					invoBaseId: entry.traderModeInvoBaseId,
					trackedEntrySim: entry.traderModeEntrySim ?? 0,
					realEntrySim,
				});
			}
			const simDifference = Math.abs(targetEntrySim - priorEntrySim);
			// Dust: no modify call needed, but still persist a resync learned
			// above so our own bookkeeping doesn't keep drifting from Invo's
			// real ledger just because no order happened to trigger a fix this cycle.
			if (simDifference < 0.0001) return realEntrySim != null ? { traderModeEntrySim: realEntrySim } : {};
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
				// simDifference/targetEntrySim/priorEntrySim logged so Invo's
				// undocumented minimum-modify threshold can be learned from real
				// prod rejections.
				log({ type: 'trader_mode_mirror_failed', action: 'modify', baseId, coin: entry.coin, simDifference, simIncrease, targetEntrySim, priorEntrySim, reason: result.error?.msg ?? 'unknown' });
				// The modify itself failed, but the resync read above is
				// still true and worth keeping - next cycle's delta should be
				// computed from Invo's real ledger, not from a stale value.
				return realEntrySim != null ? { traderModeEntrySim: realEntrySim } : {};
			}
			log({ type: 'trader_mode_mirrored', action: 'modify', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId, simDifference, simIncrease, postId: result.postId ?? null });
			if (config.autoShare) await this.repost(baseId, entry.traderModeInvoBaseId, config, true);
			return { traderModeEntrySim: targetEntrySim };
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_mirror_adjust', baseId, coin: entry.coin, message: e.message });
			return {};
		}
	}

	async mirrorClose(baseId: string, entry: PositionState, config: TraderModeConfig, closingPrice: number | null): Promise<void> {
		if (!isTraderModeActive(config)) return;
		const { invo, log, dryRun } = this.opts;
		if (!entry.traderModeInvoBaseId) {
			// Trader mode is on but this position was never successfully
			// mirrored (opened before Trader mode, or every mirror attempt
			// failed) - there is nothing to close on the mirror portfolio.
			// Logged rather than returned silently so a "close didn't repost"
			// report is diagnosable straight from the logs. The reconciler's
			// per-cycle orphan sweep is the backstop if a sim really is left open.
			log({ type: 'trader_mode_close_skipped_no_mirror', baseId, coin: entry.coin, detail: 'no mirrored Invo trade on record for this position; nothing to close on the Trader-mode portfolio' });
			return;
		}

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
			log({ type: 'trader_mode_mirrored', action: 'close', baseId, coin: entry.coin, invoBaseId: entry.traderModeInvoBaseId, postId: result.postId ?? null });
			if (config.autoShare) await this.repost(baseId, entry.traderModeInvoBaseId, config, true);
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_mirror_close', baseId, coin: entry.coin, message: e.message });
		}
	}

	/**
	 * `ticker/create` came back "already exists" - find the open sim on this
	 * coin to re-attach to. Only returns a match when EXACTLY ONE open sim
	 * matches the coin; anything ambiguous is logged and left for the manual
	 * path / next cycle rather than guessed at.
	 */
	private async recoverExistingMirror(coin: string, config: TraderModeConfig): Promise<{ baseId: string; entrySim?: number } | undefined> {
		const { invo, log } = this.opts;
		try {
			const sims = await invo.getInvestmentsSims(config.portfolioId!);
			if (!sims.success) return undefined;
			const matches = (sims.investments ?? [])
				.map(extractSimInvestment)
				.filter((s) => s.baseId && s.isOpen !== false && s.coin === coin);
			if (matches.length === 1) return { baseId: matches[0].baseId!, entrySim: matches[0].entrySim };
			log({ type: 'trader_mode_mirror_open_conflict_unresolved', coin, candidateCount: matches.length });
			return undefined;
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_recover_mirror', coin, message: e.message });
			return undefined;
		}
	}

	/** Reads back Invo's own ledger value for one mirrored sim - the resize path has no other way to know if a prior `modify` actually applied what was requested. */
	private async fetchRealEntrySim(invoBaseId: string, config: TraderModeConfig): Promise<number | undefined> {
		const { invo, log } = this.opts;
		try {
			const sims = await invo.getInvestmentsSims(config.portfolioId!);
			if (!sims.success) return undefined;
			const match = (sims.investments ?? []).map(extractSimInvestment).find((s) => s.baseId === invoBaseId);
			return match?.entrySim;
		} catch (e: any) {
			log({ type: 'error', source: 'trader_mode_fetch_real_entry_sim', invoBaseId, message: e.message });
			return undefined;
		}
	}

	private async repost(baseId: string, invoBaseId: string, config: TraderModeConfig, isUpdate: boolean): Promise<void> {
		const { invo, log } = this.opts;
		const content = config.caption && config.caption.trim() ? config.caption : EMPTY_CAPTION_FALLBACK;
		// One retry: Invo's repost endpoint 500s / times out intermittently
		// (seen repeatedly in prod logs) and usually succeeds on a second try
		// a couple seconds later. Best-effort only - a second failure is just
		// logged, never thrown.
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				const result = await invo.repostInvestment({
					baseId: invoBaseId,
					userTags: null,
					content,
					isUpdate,
					isPrivateIfUserPrivate: true,
					showUpdateChanges: null,
					inMonetizePackage: null,
				});
				if (result.success) {
					log({ type: 'trader_mode_reposted', baseId, invoBaseId, isUpdate, postId: result.postId ?? null });
					return;
				}
				if (attempt === 2) {
					log({ type: 'trader_mode_repost_failed', baseId, invoBaseId, reason: result.error ?? 'unknown' });
					return;
				}
			} catch (e: any) {
				if (attempt === 2) {
					log({ type: 'error', source: 'trader_mode_repost', baseId, invoBaseId, message: e.message });
					return;
				}
			}
			await sleep(REPOST_RETRY_DELAY_MS);
		}
	}
}
