import "server-only";
import type { ClosedInvestment } from "@daemon/types.js";
import { readTrackedState } from "../daemon/readState";
import { readIgnoredTrades } from "../daemon/readIgnored";
import { readClosedTrades } from "../daemon/readClosedTrades";
import { readLogEvents } from "../daemon/readLogs";
import { getInvoClient } from "../invo/client";
import { getHyperliquidClient } from "../hyperliquid/client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";
import { buildTradeHistory, GENERIC_CLOSE_REASON, UNATTRIBUTED_CLOSE_REASON, FILL_MATCH_TOLERANCE_MS } from "./buildTradeHistory";
import type { TradeHistoryEntry } from "@/types/ui";

const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // logs are bounded by LOG_RETENTION_HOURS anyway; this is just an upper bound on how far back we ask readLogEvents to look
const CACHE_TTL_MS = 45_000;

async function fetchHistory(): Promise<{ trades: TradeHistoryEntry[] }> {
	const invo = getInvoClient();
	const hlClientPromise = getHyperliquidClient();
	// getUserFills only depends on the HL client, not on anything else fetched
	// here, so it's kicked off as soon as that resolves and run concurrently
	// with the (slower) Invo followed-portfolios call, instead of after it.
	const hlUserFillsPromise = hlClientPromise.then((hl) => hl.getUserFills().catch(() => []));

	const [, state, ignored, closedTrades, logEvents, portfolios, hlUserFills] = await Promise.all([
		hlClientPromise,
		Promise.resolve(readTrackedState()),
		Promise.resolve(readIgnoredTrades()),
		Promise.resolve(readClosedTrades()),
		Promise.resolve(readLogEvents(Date.now() - HISTORY_WINDOW_MS)),
		invo.getFollowedPortfolios(),
		hlUserFillsPromise,
	]);
	const closedTradesByBaseId = new Map(closedTrades.map((t) => [t.baseId, t]));

	// Deliberately no per-portfolio getOpenInvestments/getClosedInvestments
	// fetch here - see buildTradeHistory's GENERIC_CLOSE_REASON doc. Those
	// calls only ever mattered as a fallback for a trade whose own local
	// `closed` log event rotated out of retention; for anything with an
	// intact log trail (the common case) they contributed nothing that
	// wasn't already known locally or from HL's fills. Fetching all of them
	// unconditionally, for every followed portfolio, on every cache refresh,
	// was real, measured cost (recon 2026-08-11: ~1.8s of a ~2.5s cold build)
	// paid regardless of whether anyone was even looking at old-enough history
	// to need it. loadHistoryPage below fetches this per-portfolio fallback
	// lazily, only for the specific handful of portfolios a given page's
	// GENERIC_CLOSE_REASON entries actually need.
	const trades = buildTradeHistory({ state, ignored, logEvents, portfolios, hlUserFills, closedTradesByBaseId });

	return { trades };
}

/** Shared + stale-while-revalidate across /api/history, both history pages' SSR fetch, and loadAnalytics - keeps list/detail baseIds consistent and never blocks navigation on a live Invo/HL round trip after the first load. */
export const loadHistory = staleWhileRevalidate(fetchHistory, CACHE_TTL_MS);

/**
 * Real per-page lazy loading: fills in the one thing the cheap build above
 * can't know (a stale trade's actual close reason from Invo, when its own
 * log event is gone) for only the entries on the page actually being viewed,
 * fetching investments for only the small set of portfolios those entries
 * belong to instead of every followed portfolio. Most pages need zero calls.
 */
function applyClosedInvestment(t: TradeHistoryEntry, inv: ClosedInvestment): TradeHistoryEntry {
	const leverage = t.leverage ?? inv.leverage;
	const entryPrice = t.entryPrice ?? inv.entryPrice;
	const closingPrice = t.closingPrice ?? inv.closingPrice ?? undefined;
	const notionalUsd = t.notionalUsd ?? (t.marginUsd != null && leverage != null ? t.marginUsd * leverage : undefined);

	return {
		...t,
		closeReason: inv.reasonClosed ?? t.closeReason,
		closedAt: t.closedAt ?? inv.closedAt,
		portfolioId: t.portfolioId ?? inv.portfolio?.id,
		portfolioTitle: t.portfolioTitle ?? inv.portfolio?.title,
		trader: t.trader ?? inv.owner?.username,
		leverage,
		entryPrice,
		closingPrice,
		notionalUsd,
	};
}

/**
 * Real per-page lazy enrichment, in two tiers:
 *
 * 1. GENERIC_CLOSE_REASON entries already know their portfolioId (some local
 *    state/log trail exists, just not the close reason) - fetch investments
 *    for only that small set of portfolios.
 * 2. UNATTRIBUTED_CLOSE_REASON entries have no baseId trail at all (a pure
 *    HL-fill reconstruction) - the only way to attribute these without local
 *    data is to cross-reference every followed portfolio's own closed-investment
 *    history by coin + direction + close time. Only applied when exactly one
 *    candidate matches; genuinely ambiguous ones are left as Unattributed
 *    rather than guessing.
 */
export async function enrichHistoryPage(page: TradeHistoryEntry[]): Promise<TradeHistoryEntry[]> {
	const genericEntries = page.filter((t) => t.status === "closed" && t.closeReason === GENERIC_CLOSE_REASON && t.portfolioId);
	const unattributedEntries = page.filter((t) => t.status === "closed" && t.closeReason === UNATTRIBUTED_CLOSE_REASON && t.closedAt);

	if (genericEntries.length === 0 && unattributedEntries.length === 0) return page;

	const invo = getInvoClient();
	const closedByBaseId = new Map<string, ClosedInvestment>();
	const matchByTradeBaseId = new Map<string, ClosedInvestment>();

	const portfolioIdsNeeded = new Set(genericEntries.map((t) => t.portfolioId as string));
	const genericFetch = Promise.all(
		[...portfolioIdsNeeded].map(async (portfolioId) => {
			const closed = await invo.getClosedInvestments(portfolioId, 1, 30).catch(() => []);
			for (const inv of closed) closedByBaseId.set(inv.baseId, inv);
		}),
	);

	const crossRefFetch =
		unattributedEntries.length === 0
			? Promise.resolve()
			: invo
					.getFollowedPortfolios()
					.catch(() => [])
					.then(async (portfolios) => {
						const allClosed = (
							await Promise.all(portfolios.map((p) => invo.getClosedInvestments(p.id, 1, 30).catch(() => [])))
						).flat();
						for (const t of unattributedEntries) {
							const tMs = Date.parse(t.closedAt as string);
							const candidates = allClosed.filter(
								(inv) => inv.ticker === t.coin && inv.directionLong === t.isBuy && Math.abs(Date.parse(inv.closedAt) - tMs) <= FILL_MATCH_TOLERANCE_MS,
							);
							if (candidates.length === 1) matchByTradeBaseId.set(t.baseId, candidates[0]);
						}
					});

	await Promise.all([genericFetch, crossRefFetch]);

	return page.map((t) => {
		if (t.status !== "closed") return t;
		if (t.closeReason === GENERIC_CLOSE_REASON) {
			const inv = closedByBaseId.get(t.baseId);
			return inv ? applyClosedInvestment(t, inv) : t;
		}
		if (t.closeReason === UNATTRIBUTED_CLOSE_REASON) {
			const inv = matchByTradeBaseId.get(t.baseId);
			return inv ? applyClosedInvestment(t, inv) : t;
		}
		return t;
	});
}
