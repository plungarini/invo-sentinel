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
