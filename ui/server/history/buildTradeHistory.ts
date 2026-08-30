import type {
	ClosedInvestment,
	ClosedTradeRecord,
	HyperliquidFill,
	IgnoredTradesMap,
	OpenInvestment,
	PositionStateMap,
} from "@daemon/types.js";
import type { TradeHistoryEntry, TradeLifecycleEvent } from "@/types/ui";
import { humanizeLogEvent } from "./humanizeLogEvent";
import { reconstructClosedTradesFromFills, type FillTrade } from "./reconstructTradesFromFills";

export const FILL_MATCH_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/** Sentinel closeReason for a real HL fill that never matched any local baseId at all - no state/log trail whatsoever, just an exchange-side close. Distinct from GENERIC_CLOSE_REASON, which still has a baseId, just an unknown reason. */
export const UNATTRIBUTED_CLOSE_REASON = "Unattributed";

/** Overrides any other closeReason source once a matching HL fill confirms it - exchange ground truth beats daemon/Invo-derived guesses like "manual close detected". */
export const LIQUIDATED_CLOSE_REASON = "Liquidated";

export interface BuildTradeHistoryArgs {
	state: PositionStateMap;
	ignored: IgnoredTradesMap;
	logEvents: Record<string, unknown>[];
	/** Cheap id->title pairs (e.g. from getFollowedPortfolios) - enough for attribution without fetching anyone's actual investments. */
	portfolios: { id: string; title: string }[];
	/**
	 * Only needed as a fallback for closeReason/closedAt on a closed trade whose
	 * own local `closed` log event has rotated out of retention - the common
	 * case (recent trade, intact logs) needs neither map at all. Callers doing
	 * real pagination should leave these empty and enrich only the specific
	 * portfolios a given page's `GENERIC_CLOSE_REASON` entries actually need,
	 * rather than fetching every followed portfolio's investments up front.
	 */
	invoOpenInvestmentsByPortfolio?: Map<string, OpenInvestment[]>;
	invoClosedInvestmentsByPortfolio?: Map<string, ClosedInvestment[]>;
	hlUserFills: HyperliquidFill[];
	/**
	 * Durable closed-trade rows from `closed_trades` (sentinel.db), keyed by
	 * baseId - the ONE source here that survives both the close itself
	 * (state is deleted at that point) and the portfolio later being
	 * unfollowed (portfolioTitle is a snapshot taken at close time, so it's
	 * still known even once the live followed-portfolios list drops it).
	 * Takes precedence over log/fill reconstruction for the fields it
	 * carries; absent entirely for closes that predate this store.
	 */
	closedTradesByBaseId?: Map<string, ClosedTradeRecord>;
}

/** Sentinel closeReason meaning "no local or exchange-derived reason was known" - the signal that a targeted enrichment fetch (see loadHistory.ts) could still fill this in from Invo's own closed-investment record. */
export const GENERIC_CLOSE_REASON = "closed";

const MANUAL_CLOSE_DETECTED_REASONS: Record<string, string> = {
	manual_close_detected: "manual close detected",
	manual_direction_change_detected: "manual direction change detected",
	manual_close: "manual close via CLI (npm run close)",
};

/**
 * Pure join, no I/O - same "pure core, I/O at the edges" split as
 * buildReconcileReport, but emits enriched per-trade rows instead of issues.
 * Reuses that file's grouping/matching patterns (group log events by baseId,
 * match HL fills to closes by coin+time) adapted for trade history rather
 * than discrepancy detection.
 */
export function buildTradeHistory(args: BuildTradeHistoryArgs): TradeHistoryEntry[] {
	const {
		state,
		logEvents,
		portfolios,
		invoOpenInvestmentsByPortfolio = new Map(),
		invoClosedInvestmentsByPortfolio = new Map(),
		hlUserFills,
		closedTradesByBaseId = new Map(),
	} = args;

	const eventsByBaseId = new Map<string, Record<string, unknown>[]>();
	for (const e of logEvents) {
		const ids = new Set<string>();
		if (typeof e.baseId === "string") ids.add(e.baseId);
		if (Array.isArray(e.clearedBaseIds)) {
			for (const id of e.clearedBaseIds) if (typeof id === "string") ids.add(id);
		}
		for (const id of ids) {
			const list = eventsByBaseId.get(id) ?? [];
			list.push(e);
			eventsByBaseId.set(id, list);
		}
	}
	for (const list of eventsByBaseId.values()) {
		list.sort((a, b) => Date.parse(a.ts as string) - Date.parse(b.ts as string));
	}

	const flatOpen: OpenInvestment[] = [...invoOpenInvestmentsByPortfolio.values()].flat();
	const flatClosed: ClosedInvestment[] = [...invoClosedInvestmentsByPortfolio.values()].flat();
	const openByBaseId = new Map(flatOpen.map((inv) => [inv.baseId, inv]));
	const closedByBaseId = new Map(flatClosed.map((inv) => [inv.baseId, inv]));

	// Title lookup needs no per-portfolio investment fetch at all - the cheap
	// followed-portfolios list already carries it. Investment-derived titles
	// (when that map happens to be populated) can only agree, so either source works.
	const portfolioTitleById = new Map<string, string>(portfolios.map((p) => [p.id, p.title]));
	for (const inv of [...flatOpen, ...flatClosed]) {
		if (inv.portfolio?.id && inv.portfolio.title) portfolioTitleById.set(inv.portfolio.id, inv.portfolio.title);
	}

	const allBaseIds = new Set<string>(Object.keys(state));
	for (const [baseId, events] of eventsByBaseId) {
		if (events.some((e) => e.type === "opened" || e.type === "auto_adopted")) allBaseIds.add(baseId);
	}
	// closedTradesByBaseId is the ONE source that survives log rotation
	// (LOG_RETENTION_HOURS) - without this, a closed trade whose own
	// "opened"/"auto_adopted" log line has already rotated out never enters
	// `allBaseIds` at all, so its durable record below is never consulted and
	// the trade falls through to the fills-only "Unattributed" reconstruction
	// even though its trader/portfolio/prices are fully known here.
	for (const baseId of closedTradesByBaseId.keys()) allBaseIds.add(baseId);

	// Ground truth for "what actually closed" comes from HL's own fills, not
	// our local logs (which may be empty/rotated/never-populated for a given
	// trade) - matched to a baseId below when possible, kept as unattributed
	// real closes otherwise, so a genuine close is never simply invisible.
	const fillTrades = reconstructClosedTradesFromFills(hlUserFills);
	const usedFillTradeIndices = new Set<number>();

	function matchFillTrade(coin: string, referenceMs: number): number | undefined {
		let bestIdx: number | undefined;
		let bestDiff = Infinity;
		fillTrades.forEach((t, i) => {
			if (usedFillTradeIndices.has(i) || t.coin !== coin) return;
			const diff = Number.isFinite(referenceMs) ? Math.abs(Date.parse(t.closedAt) - referenceMs) : 0;
			if (diff < bestDiff) {
				bestDiff = diff;
				bestIdx = i;
			}
		});
		if (bestIdx === undefined) return undefined;
		if (Number.isFinite(referenceMs) && bestDiff > FILL_MATCH_TOLERANCE_MS) {
			const candidatesForCoin = fillTrades.filter((t, i) => !usedFillTradeIndices.has(i) && t.coin === coin);
			if (candidatesForCoin.length !== 1) return undefined; // ambiguous - don't guess
		}
		return bestIdx;
	}

	const entries: TradeHistoryEntry[] = [];

	for (const baseId of allBaseIds) {
		const stateEntry = state[baseId];
		const baseEvents = eventsByBaseId.get(baseId) ?? [];
		const openInv = openByBaseId.get(baseId);
		const closedInv = closedByBaseId.get(baseId);
		// The one source that survives both the close (state is deleted at
		// that point) and the portfolio later being unfollowed - see
		// closedTradesByBaseId's doc on BuildTradeHistoryArgs. Only relevant
		// once already closed; an open trade's own live state is authoritative.
		const durable = !stateEntry ? closedTradesByBaseId.get(baseId) : undefined;

		const isOpen = !!stateEntry;
		const status: "open" | "closed" = isOpen ? "open" : "closed";

		const coin = stateEntry?.coin ?? durable?.coin ?? openInv?.ticker ?? closedInv?.ticker ?? findField<string>(baseEvents, "coin");
		if (!coin) continue; // no coin known from any source - nothing usable to show

		const isBuy = stateEntry ? stateEntry.isBuy : (durable?.isBuy ?? deriveIsBuy(stateEntry, baseEvents, openInv, closedInv));
		const trader = stateEntry?.ownerUsername ?? durable?.ownerUsername ?? openInv?.owner?.username ?? closedInv?.owner?.username ?? findField<string>(baseEvents, "trader");
		const portfolioId = stateEntry?.portfolioId ?? durable?.portfolioId ?? openInv?.portfolio?.id ?? closedInv?.portfolio?.id;
		// portfolioTitleById only knows CURRENTLY followed portfolios - an open
		// trade whose portfolio was unfollowed (but is still tracked
		// independently, see reconciler.ts) needs its own state-level snapshot
		// instead, the same way durable.portfolioTitle covers a closed trade.
		const portfolioTitle = (portfolioId ? portfolioTitleById.get(portfolioId) : undefined) ?? stateEntry?.portfolioTitle ?? durable?.portfolioTitle;

		const openedEvent = baseEvents.find((e) => e.type === "opened" || e.type === "auto_adopted");
		const openedAt = stateEntry?.openedAt ?? durable?.openedAt ?? (openedEvent?.ts as string | undefined);

		let leverage =
			stateEntry?.leverage ??
			durable?.leverage ??
			findLastField<number>(baseEvents, ["opened", "increased", "reduced", "dry_run_open", "dry_run_increase", "dry_run_reduce"], "leverage");
		let entryPrice = stateEntry?.entryPrice ?? durable?.entryPrice;
		const marginUsd = isOpen ? stateEntry.marginUsd : (durable?.marginUsd ?? deriveLastKnownMarginUsd(baseEvents));

		const lifecycle: TradeLifecycleEvent[] = baseEvents.map((e) => ({
			ts: e.ts as string,
			type: e.type as string,
			detail: humanizeLogEvent(e),
		}));

		let closedAt: string | undefined;
		let closeReason: string | undefined;
		let pnlUsd: number | undefined;
		let pnlPercent: number | undefined;
		let feesUsd: number | undefined;
		let notionalUsd: number | undefined;
		let closingPrice: number | undefined;

		if (!isOpen) {
			const closeEvent = baseEvents.find((e) => e.type === "closed");
			const manualDetectedEvent = baseEvents.find((e) => (e.type as string) in MANUAL_CLOSE_DETECTED_REASONS);

			closedAt = durable?.closedAt ?? (closeEvent?.ts as string) ?? (manualDetectedEvent?.ts as string) ?? closedInv?.closedAt ?? undefined;
			closingPrice = durable?.closingPrice;

			if (durable) {
				// durable.closeReason is one of this daemon's own internal codes
				// (see position-sync.ts's `recordClosedTrade`/close-position.ts),
				// not a display string - map the manual ones to the same labels
				// the log-derived path below would have used; a plain "closed"
				// still prefers Invo's own reasonClosed when known.
				closeReason = MANUAL_CLOSE_DETECTED_REASONS[durable.closeReason] ?? closedInv?.reasonClosed ?? (durable.closeReason === "closed" ? "trader closed" : durable.closeReason);
			} else if (manualDetectedEvent) {
				closeReason = MANUAL_CLOSE_DETECTED_REASONS[manualDetectedEvent.type as string];
			} else if (closedInv?.reasonClosed) {
				closeReason = closedInv.reasonClosed;
			} else if (closeEvent) {
				closeReason = "trader closed";
			} else {
				closeReason = GENERIC_CLOSE_REASON;
			}

			const referenceMs = closedAt ? Date.parse(closedAt) : (openedAt ? Date.parse(openedAt) : NaN);
			const fillIdx = matchFillTrade(coin, referenceMs);
			if (fillIdx !== undefined) {
				usedFillTradeIndices.add(fillIdx);
				const trade = fillTrades[fillIdx];
				if (trade.isLiquidated) closeReason = LIQUIDATED_CLOSE_REASON;
				pnlUsd = trade.pnlUsd;
				feesUsd = trade.feesUsd;
				closedAt = closedAt ?? trade.closedAt; // ground-truth timestamp when we had none locally
				entryPrice = entryPrice ?? trade.entryPrice;
				closingPrice = closingPrice ?? trade.closingPrice;
				// Prefer real margin-based ROI when known (leveraged return on what was
				// actually put at risk). When margin/leverage is unknown - the common case
				// for exchange-only reconstructed closes - fall back to return-on-notional
				// (pnl / position value) so a % is still shown instead of nothing at all.
				notionalUsd = trade.sizeOpened && trade.entryPrice ? trade.sizeOpened * trade.entryPrice : undefined;
				const effectiveBase =
					typeof marginUsd === "number" && marginUsd > 0
						? marginUsd
						: leverage && notionalUsd
							? notionalUsd / leverage
							: notionalUsd;
				if (effectiveBase) pnlPercent = (pnlUsd / effectiveBase) * 100;
			}
		}

		if (notionalUsd == null && marginUsd != null && leverage != null) {
			notionalUsd = marginUsd * leverage;
		} else if (leverage == null && notionalUsd != null && marginUsd != null && marginUsd > 0) {
			// Not known directly (e.g. a fills-only reconstruction), but derivable from the
			// two numbers we do have - rounded, since real leverage is always a whole number.
			leverage = Math.round(notionalUsd / marginUsd);
		}

		entries.push({
			baseId,
			coin,
			isBuy,
			trader,
			portfolioId,
			portfolioTitle,
			status,
			openedAt,
			closedAt,
			marginUsd,
			notionalUsd,
			leverage,
			entryPrice,
			closingPrice,
			pnlPercent,
			pnlUsd,
			feesUsd,
			closeReason,
			lifecycle,
		});
	}

	// Real closed trades on the wallet that never matched any daemon-tracked
	// baseId at all (predate this daemon, or the local log/state trail is
	// simply gone) - surfaced as-is rather than silently dropped, since HL's
	// fills are ground truth regardless of what this daemon happened to log.
	fillTrades.forEach((trade, i) => {
		if (usedFillTradeIndices.has(i)) return;
		// No tracked margin/leverage exists for these at all - return-on-notional
		// is the only % this daemon can ever know for an unattributed exchange close.
		const notionalBase = trade.sizeOpened && trade.entryPrice ? trade.sizeOpened * trade.entryPrice : undefined;
		const lifecycle: TradeLifecycleEvent[] = [];
		if (trade.openedAt) {
			lifecycle.push({
				ts: trade.openedAt,
				type: "opened_on_exchange",
				detail: trade.entryPrice ? `Opened at $${trade.entryPrice.toFixed(4)}` : undefined,
			});
		}
		lifecycle.push({
			ts: trade.closedAt,
			type: "closed_on_exchange",
			detail: trade.closingPrice ? `Closed at $${trade.closingPrice.toFixed(4)}` : undefined,
		});
		entries.push({
			baseId: `hl:${trade.coin}:${Date.parse(trade.closedAt)}`,
			coin: trade.coin,
			isBuy: trade.isBuy,
			status: "closed",
			openedAt: trade.openedAt,
			closedAt: trade.closedAt,
			entryPrice: trade.entryPrice,
			closingPrice: trade.closingPrice,
			notionalUsd: notionalBase,
			pnlPercent: notionalBase ? (trade.pnlUsd / notionalBase) * 100 : undefined,
			pnlUsd: trade.pnlUsd,
			feesUsd: trade.feesUsd,
			closeReason: trade.isLiquidated ? LIQUIDATED_CLOSE_REASON : UNATTRIBUTED_CLOSE_REASON,
			lifecycle,
		});
	});

	return entries.sort((a, b) => {
		if (a.status !== b.status) return a.status === "open" ? -1 : 1;
		const aTs = Date.parse((a.status === "open" ? a.openedAt : a.closedAt) ?? "");
		const bTs = Date.parse((b.status === "open" ? b.openedAt : b.closedAt) ?? "");
		const aVal = Number.isFinite(aTs) ? aTs : -Infinity;
		const bVal = Number.isFinite(bTs) ? bTs : -Infinity;
		return bVal - aVal;
	});
}

function findField<T>(events: Record<string, unknown>[], field: string): T | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const v = events[i][field];
		if (v !== undefined) return v as T;
	}
	return undefined;
}

function findLastField<T>(events: Record<string, unknown>[], types: string[], field: string): T | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		if (types.includes(events[i].type as string) && events[i][field] !== undefined) return events[i][field] as T;
	}
	return undefined;
}

function deriveIsBuy(
	stateEntry: PositionStateMap[string] | undefined,
	events: Record<string, unknown>[],
	openInv: OpenInvestment | undefined,
	closedInv: ClosedInvestment | undefined,
): boolean | undefined {
	if (stateEntry) return stateEntry.isBuy;
	for (let i = events.length - 1; i >= 0; i--) {
		const side = events[i].side;
		if (side === "long") return true;
		if (side === "short") return false;
	}
	if (openInv) return openInv.directionLong;
	if (closedInv) return closedInv.directionLong;
	return undefined;
}

/** closed log events don't carry marginUsd; best-available approximation is the last opened/increased/reduced/auto_adopted event's own margin field. */
function deriveLastKnownMarginUsd(events: Record<string, unknown>[]): number | undefined {
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i];
		if (typeof e.marginUsdAfter === "number") return e.marginUsdAfter;
		if (typeof e.adoptedMarginUsd === "number") return e.adoptedMarginUsd;
		if (typeof e.realMarginUsd === "number") return e.realMarginUsd;
	}
	return undefined;
}
