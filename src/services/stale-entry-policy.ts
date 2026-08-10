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

export interface StaleEntryVerdict {
	skip: boolean;
	/** Once true, this baseId must never be opened, no matter how its PnL moves later. */
	permanent: boolean;
	ageMinutes: number;
	pnlPercent: number;
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

/**
 * Two-tier gate, re-evaluated every cycle a baseId is still untracked:
 *
 *  - Older than maxAgeMinutes → permanently skip, regardless of current
 *    PnL. Age alone disqualifies it: a trade idea that old is no longer
 *    "fresh" to mirror, whatever its PnL happens to be at the moment a
 *    same-coin conflict clears or the daemon first sees it.
 *  - Still within the fresh window, but already up more than
 *    maxProfitPct → skip for now, but NOT permanently. A trade that
 *    pumped immediately at entry can still cool back off before the
 *    window expires; re-checked fresh next cycle. Once the window does
 *    expire, the permanent rule above takes over unconditionally.
 */
export function evaluateStaleEntry(
	investment: Pick<OpenInvestment, 'createdAt' | 'directionLong' | 'leverage' | 'entryPrice' | 'currentPrice'>,
	config: StaleEntryConfig,
): StaleEntryVerdict {
	const ageMinutes = (Date.now() - new Date(investment.createdAt).getTime()) / 60_000;
	const pnlPercent = computeInvestmentPnlPercent(investment);
	if (ageMinutes > config.maxAgeMinutes) {
		return { skip: true, permanent: true, ageMinutes, pnlPercent };
	}
	if (pnlPercent > config.maxProfitPct) {
		return { skip: true, permanent: false, ageMinutes, pnlPercent };
	}
	return { skip: false, permanent: false, ageMinutes, pnlPercent };
}
