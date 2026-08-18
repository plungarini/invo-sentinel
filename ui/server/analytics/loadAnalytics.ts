import "server-only";
import { loadHistory } from "../history/loadHistory";
import { getHyperliquidClient } from "../hyperliquid/client";
import { aggregateAnalytics } from "./aggregateAnalytics";
import { filterTradesByPeriod } from "./periodFilter";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";

/** Shared by the /api/analytics route and the Analytics page's SSR initial fetch. */
export async function loadAnalytics(period: AnalyticsPeriod = "all"): Promise<AnalyticsSummary> {
	const [{ trades }, hl] = await Promise.all([loadHistory(), getHyperliquidClient()]);
	const positions = await hl.getPositions();
	const openPnlUsd = positions.reduce((sum, p) => sum + parseFloat(p.unrealizedPnl), 0);
	return aggregateAnalytics(filterTradesByPeriod(trades, period), openPnlUsd);
}
