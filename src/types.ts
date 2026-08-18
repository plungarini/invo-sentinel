/**
 * A portfolio (trader) you follow on Invo. Field names match Invo's own
 * `get_users_followed_portfolios` response 1:1 where possible - confirmed
 * live 2026-08-11 against a real account. Notably there is no portfolio-level
 * image at all in this API; only the owner (a person) has an avatar.
 */
export interface FollowedPortfolio {
	id: string;
	title: string;
	description?: string | null;
	ownerId: string;
	ownerUsername?: string;
	ownerName?: string;
	ownerVerified?: boolean;
	ownerAvatarUrl?: string;
	ownerAvatarColor?: string;
	winRate?: number;
	wonPositions?: number;
	lostPositions?: number;
	closedPositions?: number;
	openPositions?: number;
	followerCount?: number;
	currentWinStreak?: number;
	plSnapshot?: number;
	avgPlRealized?: number;
	avgHoldTimeSeconds?: number;
	liquidated?: boolean;
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
	/**
	 * OUR OWN fill price (from HL's order response, or the live mid at
	 * auto-adopt time) - not the trader's `investment.entryPrice`, which is
	 * on their own timing and useless for computing our PnL. Absent on
	 * entries written before this field existed.
	 */
	entryPrice?: number;
	/** ISO timestamp of when this entry was first opened/adopted. */
	openedAt?: string;
	/**
	 * The risk-clamped trader fraction (0-1) we last sized an order from.
	 * Lets openOrAdjust tell "the trader's own % actually changed" apart
	 * from "the user manually resized on the exchange" - only the former
	 * should drive a new order. Absent on a brand-new/just-adopted entry,
	 * meaning the next cycle still computes one absolute target (the normal
	 * open/adopt sizing), then starts tracking incremental changes from there.
	 */
	lastAppliedFraction?: number;
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

/** Cached result of decoding a live HL position's cloid for one coin - see cloid-attribution.ts. Keyed by coin so a close+reopen under a new mimic is picked up via the positionSize check, not by baseId (which isn't known until resolved). */
export type CloidAttributionCacheEntry =
	| { kind: 'manual'; checkedAt: string; positionSize: string }
	| {
			kind: 'resolved';
			checkedAt: string;
			positionSize: string;
			baseShortId: string;
			investmentBaseId: string;
			portfolioId: string;
			trader?: string;
	  };

export type CloidAttributionCache = Record<string, CloidAttributionCacheEntry>;

export interface RiskConfig {
	/** Fraction, e.g. 0.02 for 2%. */
	minMarginPct: number;
	/** Fraction, e.g. 0.05 for 5%. */
	maxMarginPct: number;
	/** Undefined/NaN = no cap. */
	maxLeverage?: number;
}

/**
 * One entry from clearinghouseState's assetPositions[].position - HL's own
 * ground truth for an open position. entryPx/unrealizedPnl/returnOnEquity/
 * leverage/marginUsed are computed server-side by HL itself and available
 * regardless of whether this daemon tracks the baseId behind it - the same
 * numbers a real trading UI (Invo included) would show for any open position.
 */
export interface HyperliquidPosition {
	coin: string;
	szi: string;
	leverage: { type: 'cross' | 'isolated'; value: number };
	entryPx: string;
	positionValue: string;
	unrealizedPnl: string;
	returnOnEquity: string;
	marginUsed: string;
	liquidationPx: string | null;
	maxLeverage: number;
	/** Funding paid (positive) or received (negative) on this position - HL settles it continuously, not just at close. */
	cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
	[key: string]: unknown;
}

/** One real fill from HL's own /info userFills - exchange ground truth, not derived from our logs. */
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
	/** USD-denominated, per HL's own fill payload - negative for rebates. */
	fee?: string;
	feeToken?: string;
	/** Client order id - see cloid-codec.ts for Invo's own encoding of this field on mimic-placed orders. Absent/null for most fills (only set when the placing client chose to). */
	cloid?: string | null;
	/** Present only when this fill was a liquidation (HL's own signal, not inferred) - the mark price at which the liquidation engine acted. */
	liquidationMarkPx?: string;
	[key: string]: unknown;
}

/**
 * One entry from HL's /info userNonFundingLedgerUpdates - deposits,
 * withdrawals, and internal transfers, independent of trading activity.
 * `delta.type` is HL's own classification (e.g. 'deposit', 'withdraw',
 * 'send', 'receive', 'accountClassTransfer'); shape otherwise varies by
 * type - a 'deposit'/'withdraw' carries its amount in `usdc`, while a spot
 * transfer ('send'/'receive') carries it in `usdcValue`/`amount` instead -
 * so most fields beyond `type` are left as unknown.
 */
export interface HyperliquidLedgerUpdate {
	time: number;
	hash: string;
	delta: {
		type: string;
		usdc?: string;
		usdcValue?: string;
		amount?: string;
		token?: string;
		/** Sender address on a 'send'/'receive' entry - see KNOWN_DEPOSIT_RELAYERS in TransfersList.tsx. */
		user?: string;
		[key: string]: unknown;
	};
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
 * Durable record of one fully-closed mirrored trade, persisted to
 * `closed_trades` in `sentinel.db` - the one history table that survives
 * both a position closing (PositionState is deleted from `position_state`
 * at that point) and its portfolio later being unfollowed (which stops
 * tracking but never touches this record). `portfolioTitle` is a snapshot
 * taken at close time specifically so portfolio-level analytics still work
 * after an unfollow, when the live followed-portfolios list no longer has
 * that title to offer.
 */
export interface ClosedTradeRecord {
	baseId: string;
	coin: string;
	isBuy: boolean;
	leverage?: number;
	marginUsd?: number;
	portfolioId?: string;
	portfolioTitle?: string;
	ownerUsername?: string;
	entryPrice?: number;
	closingPrice?: number;
	openedAt?: string;
	closedAt: string;
	closeReason: string;
}

/**
 * One followed portfolio's margin-band override, persisted to
 * `.copy-portfolio-risk.json`. `title`/`ownerUsername` are display-only,
 * kept fresh automatically, never used for logic. `minMarginPct`/
 * `maxMarginPct` are whole-number percent (matching `.env`'s
 * MIN_MARGIN_PCT/MAX_MARGIN_PCT convention, e.g. 3 for 3%) - `null` means
 * "no override, use the .env default for this field".
 */
export interface PortfolioRiskEntry {
	portfolioId: string;
	title: string;
	ownerUsername?: string;
	minMarginPct: number | null;
	maxMarginPct: number | null;
}
