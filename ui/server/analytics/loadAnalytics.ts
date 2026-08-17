import "server-only";
import { loadHistory } from "../history/loadHistory";
import { aggregateAnalytics } from "./aggregateAnalytics";
import { filterTradesByPeriod } from "./periodFilter";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";

/** Shared by the /api/analytics route and the Analytics page's SSR initial fetch. */
export async function loadAnalytics(period: AnalyticsPeriod = "all"): Promise<AnalyticsSummary> {
	const { trades } = await loadHistory();
	return aggregateAnalytics(filterTradesByPeriod(trades, period));
}
