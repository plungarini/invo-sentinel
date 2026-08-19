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

/** Enough of a followed portfolio's profile to render `perPortfolio` like the "Followed portfolios" widget - a subset of `FollowedPortfolio`, kept local so this file stays a pure function with no I/O of its own. */
export interface PortfolioLookup {
	id: string;
	ownerUsername?: string;
	ownerAvatarUrl?: string;
	ownerAvatarColor?: string;
}

/** Same closed+determined-PnL filter aggregateAnalytics uses for totalFeesUsd - factored out so the lightweight fees-only endpoint reports the exact same figure without pulling in the rest of the (much heavier) aggregation. */
export function computeTotalFeesUsd(trades: TradeHistoryEntry[]): number {
	return trades.filter((t) => t.status === "closed").filter(hasPnlUsd).reduce((sum, t) => sum + (t.feesUsd ?? 0), 0);
}

/**
 * Pure aggregation over closed trades - no I/O. $-based metrics (total PnL,
 * win rate, equity curve) only need `pnlUsd`, known for every real closed
 * trade reconstructed from HL fills; %-based metrics additionally need
 * `pnlPercent`, only known when margin/leverage was attributable to a
 * tracked baseId - the two are aggregated separately so a real close with
 * unknown margin still counts toward $ PnL instead of being dropped entirely.
 * `openPnlUsd` (currently-open positions' unrealized PnL) is passed in rather
 * than fetched here, since it's a live exchange snapshot, not something
 * derivable from closed-trade history.
 */
export function aggregateAnalytics(trades: TradeHistoryEntry[], openPnlUsd = 0, portfolioLookup: PortfolioLookup[] = []): AnalyticsSummary {
	const closed = trades.filter((t) => t.status === "closed");
	const determined = closed.filter(hasPnlUsd);

	const totalPnlUsd = determined.reduce((sum, t) => sum + t.pnlUsd, 0);
	// Gross trading PnL - HL's closedPnl, not net of fees. Fees are tracked
	// separately since not every determined-PnL trade has a known fee (older
	// exchange-only reconstructions may lack it), so this can under-count slightly.
	const totalFeesUsd = computeTotalFeesUsd(closed);
	const wins = determined.filter((t) => t.pnlUsd > 0).length;
	const winRate = determined.length > 0 ? (wins / determined.length) * 100 : 0;
	const determinedPercents = determined.map((t) => t.pnlPercent).filter(isNumber);
	const avgPnlPercent = avg(determinedPercents);

	// Keyed by portfolioId, not portfolioTitle - two portfolios (even from
	// different traders) can share a display title, and that must not merge
	// their PnL. Falls back to title/trader only when a trade has no known
	// portfolio identity at all (older exchange-only reconstructions).
	const groups = new Map<string, { name: string; portfolioId?: string; trades: (TradeHistoryEntry & { pnlUsd: number })[] }>();
	for (const t of determined) {
		const name = t.portfolioTitle ?? t.trader ?? "Unattributed (exchange-only)";
		const key = t.portfolioId ?? name;
		const entry = groups.get(key);
		if (entry) entry.trades.push(t);
		else groups.set(key, { name, portfolioId: t.portfolioId, trades: [t] });
	}

	const portfolioById = new Map(portfolioLookup.map((p) => [p.id, p]));
	const perPortfolio: PortfolioPnlBreakdown[] = [...groups.values()]
		.map(({ name, portfolioId, trades: group }): PortfolioPnlBreakdown => {
			const groupWins = group.filter((t) => t.pnlUsd > 0).length;
			const groupPercents = group.map((t) => t.pnlPercent).filter(isNumber);
			// A followed portfolio's own profile has the real avatar; an unfollowed
			// one has no avatar source left at all - PortfolioAvatar's own
			// initials fallback covers that case, same as it does for a broken
			// image URL. The trader's own username is still known from the trade
			// record even once unfollowed, so that's used first before the lookup.
			const lookup = portfolioId ? portfolioById.get(portfolioId) : undefined;
			return {
				name,
				portfolioId,
				ownerUsername: group[0]?.trader ?? lookup?.ownerUsername,
				ownerAvatarUrl: lookup?.ownerAvatarUrl,
				ownerAvatarColor: lookup?.ownerAvatarColor,
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
		openPnlUsd,
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
