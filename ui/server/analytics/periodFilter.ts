import type { AnalyticsPeriod, TradeHistoryEntry } from "@/types/ui";
import { periodStart } from "@/lib/analyticsPeriod";

/**
 * Pure, no I/O - filters to closed trades whose closedAt falls within the period.
 * Open trades are dropped here too since aggregateAnalytics only ever counts
 * closed ones anyway, so there's nothing lost by filtering them out earlier.
 */
export function filterTradesByPeriod(trades: TradeHistoryEntry[], period: AnalyticsPeriod, now: Date = new Date()): TradeHistoryEntry[] {
	const start = periodStart(period, now);
	if (!start) return trades;
	const startMs = start.getTime();
	return trades.filter((t) => t.status === "closed" && t.closedAt && Date.parse(t.closedAt) >= startMs);
}
