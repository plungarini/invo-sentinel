import "server-only";
import { loadHistory, enrichHistoryPage } from "../history/loadHistory";
import { readFollowedPortfolios } from "../daemon/readFollowedPortfolios";
import { getHyperliquidClient } from "../hyperliquid/client";
import { aggregateAnalytics } from "./aggregateAnalytics";
import { filterTradesByPeriod } from "./periodFilter";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";

/**
 * Shared by the /api/analytics route and the Analytics page's SSR initial fetch.
 * Unlike /api/history's per-page enrichment, this runs `enrichHistoryPage` over
 * the FULL trade set before aggregating - a "By Portfolio" breakdown built from
 * only the currently-viewed history page would badly undercount older closes.
 * Reuses the same `keyedStaleWhileRevalidate` caches `/api/history` populates
 * (both call the same exported `enrichHistoryPage`), so this doesn't double
 * the outstanding Invo calls on a cold cache.
 */
export async function loadAnalytics(period: AnalyticsPeriod = "all"): Promise<AnalyticsSummary> {
	const [{ trades }, hl] = await Promise.all([loadHistory(), getHyperliquidClient()]);
	const [positions, enrichedTrades] = await Promise.all([hl.getPositions(), enrichHistoryPage(trades)]);
	const openPnlUsd = positions.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl), 0);
	return aggregateAnalytics(filterTradesByPeriod(enrichedTrades, period), openPnlUsd, readFollowedPortfolios());
}
