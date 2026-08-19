import "server-only";
import { loadHistory } from "./loadHistory";
import { computeTotalFeesUsd } from "../analytics/aggregateAnalytics";

/**
 * Fees-only figure for the Total Balance banner - deliberately NOT loadAnalytics.
 * loadAnalytics also fetches live HL positions (for openPnlUsd) and builds
 * per-portfolio/per-coin breakdowns and the whole equity curve, none of which
 * this banner needs; reuses loadHistory's own shared stale-while-revalidate
 * cache, so this costs nothing beyond a sum over already-fetched trades.
 */
export async function loadFeesTotal(): Promise<{ totalFeesUsd: number }> {
	const { trades } = await loadHistory();
	return { totalFeesUsd: computeTotalFeesUsd(trades) };
}
