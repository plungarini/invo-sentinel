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
