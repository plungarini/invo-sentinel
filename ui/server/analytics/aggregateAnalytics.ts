import type { AnalyticsSummary, CoinPnlBreakdown, PortfolioPnlBreakdown, TradeHistoryEntry } from "@/types/ui";

function hasPnlUsd(trade: TradeHistoryEntry): trade is TradeHistoryEntry & { pnlUsd: number } {
	return typeof trade.pnlUsd === "number";
}

function isNumber(n: number | undefined): n is number {
	return typeof n === "number";
}

function avg(nums: number[]): number {
	return nums.length > 0 ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

/**
 * Pure aggregation over closed trades - no I/O. $-based metrics (total PnL,
 * win rate, equity curve) only need `pnlUsd`, known for every real closed
 * trade reconstructed from HL fills; %-based metrics additionally need
 * `pnlPercent`, only known when margin/leverage was attributable to a
 * tracked baseId - the two are aggregated separately so a real close with
 * unknown margin still counts toward $ PnL instead of being dropped entirely.
 */
export function aggregateAnalytics(trades: TradeHistoryEntry[]): AnalyticsSummary {
	const closed = trades.filter((t) => t.status === "closed");
	const determined = closed.filter(hasPnlUsd);

	const totalPnlUsd = determined.reduce((sum, t) => sum + t.pnlUsd, 0);
	// Gross trading PnL - HL's closedPnl, not net of fees. Fees are tracked
	// separately since not every determined-PnL trade has a known fee (older
	// exchange-only reconstructions may lack it), so this can under-count slightly.
	const totalFeesUsd = determined.reduce((sum, t) => sum + (t.feesUsd ?? 0), 0);
	const wins = determined.filter((t) => t.pnlUsd > 0).length;
	const winRate = determined.length > 0 ? (wins / determined.length) * 100 : 0;
	const determinedPercents = determined.map((t) => t.pnlPercent).filter(isNumber);
	const avgPnlPercent = avg(determinedPercents);

	// Keyed by portfolioId, not portfolioTitle - two portfolios (even from
	// different traders) can share a display title, and that must not merge
	// their PnL. Falls back to title/trader only when a trade has no known
	// portfolio identity at all (older exchange-only reconstructions).
	const groups = new Map<string, { name: string; trades: (TradeHistoryEntry & { pnlUsd: number })[] }>();
	for (const t of determined) {
		const name = t.portfolioTitle ?? t.trader ?? "Unattributed (exchange-only)";
		const key = t.portfolioId ?? name;
		const entry = groups.get(key);
		if (entry) entry.trades.push(t);
		else groups.set(key, { name, trades: [t] });
	}

	const perPortfolio: PortfolioPnlBreakdown[] = [...groups.values()]
		.map(({ name, trades: group }): PortfolioPnlBreakdown => {
			const groupWins = group.filter((t) => t.pnlUsd > 0).length;
			const groupPercents = group.map((t) => t.pnlPercent).filter(isNumber);
			return {
				name,
				tradeCount: group.length,
				winRate: (groupWins / group.length) * 100,
				totalPnlUsd: group.reduce((sum, t) => sum + t.pnlUsd - (t.feesUsd ?? 0), 0),
				avgPnlPercent: avg(groupPercents),
				determinedPnlPercentTradeCount: groupPercents.length,
			};
		})
		.sort((a, b) => b.totalPnlUsd - a.totalPnlUsd);

	const sortedByClose = [...determined].sort((a, b) => Date.parse(a.closedAt ?? "") - Date.parse(b.closedAt ?? ""));
	let running = 0;
	const pnlOverTime = sortedByClose
		.filter((t) => t.closedAt)
		.map((t) => {
			running += t.pnlUsd - (t.feesUsd ?? 0);
			return { closedAt: t.closedAt as string, cumulativePnlUsd: running };
		});

	const longs = determined.filter((t) => t.isBuy === true);
	const shorts = determined.filter((t) => t.isBuy === false);
	const winRateOf = (group: typeof determined) =>
		group.length > 0 ? (group.filter((t) => t.pnlUsd > 0).length / group.length) * 100 : 0;

	const holdTimesSeconds = determined
		.map((t) => (t.openedAt && t.closedAt ? (Date.parse(t.closedAt) - Date.parse(t.openedAt)) / 1000 : undefined))
		.filter((n): n is number => isNumber(n) && n >= 0);
	const avgHoldTimeSeconds = holdTimesSeconds.length > 0 ? avg(holdTimesSeconds) : null;

	const volumes = determined.map((t) => t.notionalUsd).filter(isNumber);
	const totalVolumeUsd = volumes.length > 0 ? volumes.reduce((s, n) => s + n, 0) : null;

	const pnlValues = determined.map((t) => t.pnlUsd);
	const bestTradeUsd = pnlValues.length > 0 ? Math.max(...pnlValues) : null;
	const worstTradeUsd = pnlValues.length > 0 ? Math.min(...pnlValues) : null;

	const coinGroups = new Map<string, (TradeHistoryEntry & { pnlUsd: number })[]>();
	for (const t of determined) {
		const list = coinGroups.get(t.coin) ?? [];
		list.push(t);
		coinGroups.set(t.coin, list);
	}
	const byCoin: CoinPnlBreakdown[] = [...coinGroups.entries()]
		.map(([coin, group]): CoinPnlBreakdown => ({
			coin,
			tradeCount: group.length,
			winRate: winRateOf(group),
			totalPnlUsd: group.reduce((sum, t) => sum + t.pnlUsd - (t.feesUsd ?? 0), 0),
		}))
		.sort((a, b) => b.tradeCount - a.tradeCount);

	return {
		totalClosedTrades: closed.length,
		determinedPnlTradeCount: determined.length,
		determinedPnlPercentTradeCount: determinedPercents.length,
		totalPnlUsd,
		totalFeesUsd,
		winRate,
		avgPnlPercent,
		perPortfolio,
		pnlOverTime,
		longCount: longs.length,
		shortCount: shorts.length,
		longWinRate: winRateOf(longs),
		shortWinRate: winRateOf(shorts),
		avgHoldTimeSeconds,
		totalVolumeUsd,
		bestTradeUsd,
		worstTradeUsd,
		byCoin,
	};
}
