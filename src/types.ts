/** A portfolio (trader) you follow on Invo. */
export interface FollowedPortfolio {
	id: string;
	title: string;
	ownerId: string;
	ownerUsername?: string;
}

/**
 * One of a trader's currently-open investments, as returned by
 * /v1_0/investments/get_investments (isOpen: true). Field names match
 * Invo's own reverse-engineered shape 1:1; no renaming; so payloads can
 * be compared directly against real API responses while debugging.
 */
export interface OpenInvestment {
	baseId: string;
	baseShortId: string;
	ticker: string;
	directionLong: boolean;
	leverage: number;
	/**
	 * The trader's margin on this trade, as a PERCENT of THEIR OWN balance
	 * (e.g. 0.2 means 0.20%); confirmed against the Invo app UI, not
	 * documented anywhere. This is a live, current snapshot value (not a
	 * delta), reused every poll to recompute your own target margin.
	 */
	entrySize: number;
	isOpen: boolean;
	verifiedTrade: boolean;
	priceTarget: number | null;
	stopLoss: number | null;
	createdAt: string;
	entryPrice: number;
	currentPrice: number;
	portfolio: { id: string; title?: string };
	owner: { id: string; username?: string };
}

/** What we know about one mirrored trade, keyed by the trader's baseId. */
export interface PositionState {
	coin: string;
	isBuy: boolean;
	leverage: number;
	marginUsd: number;
	/** Our own client-generated baseShortId, used to link closes back to Invo. */
	ourBaseShortId: string;
	portfolioId?: string;
	ownerUsername?: string;
}

/** Full local state, persisted to disk. Keyed by the trader's baseId. */
export type PositionStateMap = Record<string, PositionState>;

/**
 * A trader's baseId that was deliberately never opened (see
 * stale-entry-policy.ts) and must stay that way for the lifetime of that
 * specific investment, not just this poll cycle.
 */
export interface IgnoredTradeEntry {
	coin: string;
	portfolioId?: string;
	reason: string;
	ignoredAt: string;
}

/** Full local ignore-list, persisted to disk. Keyed by the trader's baseId. */
export type IgnoredTradesMap = Record<string, IgnoredTradeEntry>;

export interface RiskConfig {
	/** Fraction, e.g. 0.02 for 2%. */
	minMarginPct: number;
	/** Fraction, e.g. 0.05 for 5%. */
	maxMarginPct: number;
	/** Undefined/NaN = no cap. */
	maxLeverage?: number;
}

export interface HyperliquidPosition {
	coin: string;
	szi: string;
	[key: string]: unknown;
}

/** One real fill from HL's own /info userFills — exchange ground truth, not derived from our logs. */
export interface HyperliquidFill {
	coin: string;
	px: string;
	sz: string;
	side: 'A' | 'B';
	time: number;
	dir: string;
	closedPnl: string;
	oid: number;
	tid: number;
	[key: string]: unknown;
}

/**
 * A previously-open investment now closed, as returned by
 * /v1_0/investments/get_investments (isOpen: false). Same shape as
 * OpenInvestment plus the close-specific fields.
 */
export interface ClosedInvestment extends OpenInvestment {
	isOpen: false;
	closedAt: string;
	closingPrice: number | null;
	reasonClosed: string | null;
}

/**
 * One followed portfolio's margin-band override, persisted to
 * `.copy-portfolio-risk.json`. `title`/`ownerUsername` are display-only,
 * kept fresh automatically, never used for logic. `minMarginPct`/
 * `maxMarginPct` are whole-number percent (matching `.env`'s
 * MIN_MARGIN_PCT/MAX_MARGIN_PCT convention, e.g. 3 for 3%) — `null` means
 * "no override, use the .env default for this field".
 */
export interface PortfolioRiskEntry {
	portfolioId: string;
	title: string;
	ownerUsername?: string;
	minMarginPct: number | null;
	maxMarginPct: number | null;
}
