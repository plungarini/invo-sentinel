import type { OpenInvestment } from '../types.js';

/**
 * Pure math; no I/O, no state. This is the one deliberate exception to
 * "trades are never skipped, only resized": a trade idea that's already
 * been running for a while and is already meaningfully profitable is a
 * different risk/reward than it was at its real entry. Opening it fresh,
 * at 0% PnL from our side, well after the fact (e.g. right as a same-coin
 * conflict clears) doesn't mirror what the trader actually did — it's a
 * new bet with old sizing.
 */

export interface StaleEntryConfig {
	maxAgeMinutes: number;
	/** Percent, e.g. 1 for 1%. */
	maxProfitPct: number;
}

/**
 * The trader's own leveraged return %, i.e. what they'd see as their
 * position's PnL% — not the raw underlying price move.
 */
export function computeInvestmentPnlPercent(
	investment: Pick<OpenInvestment, 'directionLong' | 'leverage' | 'entryPrice' | 'currentPrice'>,
): number {
	if (!investment.entryPrice) return 0;
	const priceMovePct = investment.directionLong
		? (investment.currentPrice - investment.entryPrice) / investment.entryPrice
		: (investment.entryPrice - investment.currentPrice) / investment.entryPrice;
	return priceMovePct * investment.leverage * 100;
}

export function isStaleProfitableEntry(
	investment: Pick<OpenInvestment, 'createdAt' | 'directionLong' | 'leverage' | 'entryPrice' | 'currentPrice'>,
	config: StaleEntryConfig,
): boolean {
	const ageMinutes = (Date.now() - new Date(investment.createdAt).getTime()) / 60_000;
	if (!(ageMinutes > config.maxAgeMinutes)) return false;
	return computeInvestmentPnlPercent(investment) > config.maxProfitPct;
}
