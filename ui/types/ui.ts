export interface TradeLifecycleEvent {
	ts: string;
	type: string;
	detail?: string;
}

/** One trade's reconstructed history, joined from state/logs/Invo/HL - see buildTradeHistory.ts. */
export interface TradeHistoryEntry {
	baseId: string;
	coin: string;
	isBuy?: boolean;
	trader?: string;
	portfolioId?: string;
	portfolioTitle?: string;
	status: "open" | "closed";
	openedAt?: string;
	closedAt?: string;
	marginUsd?: number;
	/** Position value at entry (size × entryPrice) - known even when marginUsd/leverage aren't, e.g. for unattributed exchange-only closes. */
	notionalUsd?: number;
	leverage?: number;
	entryPrice?: number;
	closingPrice?: number;
	pnlPercent?: number;
	pnlUsd?: number;
	feesUsd?: number;
	closeReason?: string;
	lifecycle: TradeLifecycleEvent[];
}

export interface PortfolioPnlBreakdown {
	name: string;
	tradeCount: number;
	winRate: number;
	totalPnlUsd: number;
	avgPnlPercent: number;
	determinedPnlPercentTradeCount: number;
}

export type AnalyticsPeriod = "today" | "wtd" | "mtd" | "ytd" | "all";

export interface PnlOverTimePoint {
	closedAt: string;
	cumulativePnlUsd: number;
}

export interface CoinPnlBreakdown {
	coin: string;
	tradeCount: number;
	winRate: number;
	totalPnlUsd: number;
}

/** Aggregated from closed trades only - see aggregateAnalytics.ts. */
export interface AnalyticsSummary {
	totalClosedTrades: number;
	determinedPnlTradeCount: number;
	determinedPnlPercentTradeCount: number;
	totalPnlUsd: number;
	totalFeesUsd: number;
	winRate: number;
	avgPnlPercent: number;
	perPortfolio: PortfolioPnlBreakdown[];
	pnlOverTime: PnlOverTimePoint[];
	longCount: number;
	shortCount: number;
	longWinRate: number;
	shortWinRate: number;
	/** Only over trades with both a known leverage and a known open+close timestamp/notional, respectively - never assumed. */
	avgHoldTimeSeconds: number | null;
	totalVolumeUsd: number | null;
	bestTradeUsd: number | null;
	worstTradeUsd: number | null;
	byCoin: CoinPnlBreakdown[];
}
