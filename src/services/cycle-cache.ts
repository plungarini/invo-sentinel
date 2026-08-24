import type { HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { HyperliquidFill, HyperliquidPosition } from '../types.js';

/**
 * Memoizes the handful of Hyperliquid reads that are safe to reuse for the
 * duration of a single reconcile cycle - fills, live positions, account
 * equity, and mark prices - so repeated call sites within one cycle (e.g.
 * every investment's own conflict/resync check in PositionSync, plus the
 * reconciler's own detached-position and cloid-discovery checks) share one
 * real HL call instead of one each. `reset()` at the top of every cycle
 * throws all of it away, so the next cycle always starts from a genuinely
 * fresh read - staleness never crosses a cycle boundary.
 *
 * This intentionally trades a little intra-cycle freshness (e.g. account
 * equity used by the 5th investment processed this cycle won't reflect an
 * order the 1st investment already placed a second ago) for far fewer
 * round trips; on a cycle that takes low single-digit seconds, that drift
 * is negligible next to the risk band's own resizing tolerance, which never
 * treats equity as anything more precise than "as of this cycle" anyway.
 *
 * Deliberately NOT used for the read right before actually sizing a close
 * order (`PositionSync.close`, `closePosition`) - those size a real order
 * off the read, so they stay on live, uncached calls.
 */
export class CycleCache {
	private fillsPromise: Promise<HyperliquidFill[]> | null = null;
	private clearinghousePromise: Promise<{ positions: HyperliquidPosition[]; accountValueUsd: number }> | null = null;
	private midsPromise: Promise<Record<string, string>> | null = null;

	constructor(private hl: HyperliquidClient) {}

	reset(): void {
		this.fillsPromise = null;
		this.clearinghousePromise = null;
		this.midsPromise = null;
	}

	getFillsOnce(): Promise<HyperliquidFill[]> {
		if (!this.fillsPromise) this.fillsPromise = this.hl.getUserFills();
		return this.fillsPromise;
	}

	private getClearinghouseStateOnce(): Promise<{ positions: HyperliquidPosition[]; accountValueUsd: number }> {
		if (!this.clearinghousePromise) this.clearinghousePromise = this.hl.getClearinghouseState();
		return this.clearinghousePromise;
	}

	async getPositionsOnce(): Promise<HyperliquidPosition[]> {
		return (await this.getClearinghouseStateOnce()).positions;
	}

	async getAccountValueUsdOnce(): Promise<number> {
		return (await this.getClearinghouseStateOnce()).accountValueUsd;
	}

	getAllMidsOnce(): Promise<Record<string, string>> {
		if (!this.midsPromise) this.midsPromise = this.hl.getAllMids();
		return this.midsPromise;
	}
}
