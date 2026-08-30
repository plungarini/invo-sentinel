import type { TraderModeConfig } from '../types.js';

export function isTraderModeActive(config: TraderModeConfig): boolean {
	return config.enabled && !!config.portfolioId;
}

/** Fraction of OUR real equity currently committed to this trade. */
export function computeEquityFraction(marginUsd: number, equity: number): number {
	return equity ? marginUsd / equity : 0;
}

/**
 * The `entrySim` value for Invo's paper-trade create/modify endpoints. Invo
 * takes it in the SAME units as a trader's own `entrySize` - a percent of the
 * portfolio's own balance, where the number IS the percent (value `1` = 1%,
 * per types.ts `OpenInvestment.entrySize`) - so it's exactly our real
 * position's equity fraction expressed as a percent. Confirmed live
 * 2026-08-28: a real 1.00%-of-equity position mirrored with `entrySim`
 * computed as `equityFraction * portfolioRemainingSim` landed at 0.86% on the
 * sim portfolio, because that multiply scales the mirror by whatever sim
 * balance happens to be free (the same real position mirrored between 0.72
 * and 1.70 across days as other sims opened/closed - see the prod logs). The
 * remaining-sim balance must not enter this at all.
 */
export function computeEntrySim(equityFraction: number): number {
	return Math.max(0, equityFraction * 100);
}

export interface SimInvestmentLite {
	baseId?: string;
	coin?: string;
	isOpen?: boolean;
	/** Invo's own cumulative ledger value for this sim - the ground truth to resync our own `traderModeEntrySim` against, since a modify's `simDifference` is not guaranteed to land exactly as requested (see trader-mode-sync.ts). */
	entrySim?: number;
}

/**
 * Invo's `get_investments_sims` `investments[]` element shape is not
 * reverse-engineered - this pulls just the fields Trader-mode's orphan
 * cleanup (reconciler.ts), "already exists" self-heal, and resize resync
 * (trader-mode-sync.ts) need, defensively, tolerating any of the field names
 * Invo uses for them elsewhere. `isOpen` left `undefined` when absent so
 * callers can decide how to treat "unknown" (both current callers treat only
 * an explicit `false` as closed). Confirmed live 2026-08-31 against a real
 * response: `{baseId, ticker, lastSim, leverage, directionLong, entryPrice,
 * entrySim, feeSim}` - mapped from Invo's own `entrySim` field (not
 * `lastSim`, which decays over time via `feeSim` and is not the sizing basis
 * we control).
 */
export function extractSimInvestment(raw: unknown): SimInvestmentLite {
	if (!raw || typeof raw !== 'object') return {};
	const r = raw as Record<string, unknown>;
	const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
	return {
		baseId: str(r.baseId) ?? str(r.id) ?? str(r.investmentId),
		coin: str(r.ticker) ?? str(r.coin) ?? str(r.symbol) ?? str(r.name),
		isOpen: typeof r.isOpen === 'boolean' ? r.isOpen : undefined,
		entrySim: typeof r.entrySim === 'number' ? r.entrySim : undefined,
	};
}
