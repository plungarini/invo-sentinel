import type { TraderModeConfig } from '../types.js';

export function isTraderModeActive(config: TraderModeConfig): boolean {
	return config.enabled && !!config.portfolioId;
}

/** Fraction of OUR real equity currently committed to this trade. */
export function computeEquityFraction(marginUsd: number, equity: number): number {
	return equity ? marginUsd / equity : 0;
}

/**
 * Invo's own paper-trading `entrySim` (a % of the Trader-mode portfolio's
 * remaining sim balance) that mirrors our real position proportionally -
 * the same normalization Invo itself applies to a trader's own `entrySize`
 * (a % of THEIR balance), just computed from our side instead of theirs.
 */
export function computeEntrySim(equityFraction: number, portfolioRemainingSim: number): number {
	return Math.max(0, equityFraction * portfolioRemainingSim);
}
