import type { InvoClient } from '../clients/invo-client.js';
import { decodeCloidToBaseShortId } from '../services/cloid-codec.js';
import type { Logger } from '../services/logger.js';
import type { CloidAttributionCache, HyperliquidFill, HyperliquidPosition, OpenInvestment, PositionStateMap } from '../types.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

/**
 * Only the single most recent fill for a coin - never search further back
 * into history. A position's own open AND its later close/reopen fills
 * decode consistently (confirmed live 2026-08-13), so that's enough for a
 * position Invo's client has been managing continuously. But for a coin
 * with an OLDER real Invo cloid further back that this daemon has since
 * taken over (its own orders never set cloid), searching past those to an
 * older cloid would wrongly resurface a stale, already-superseded
 * attribution - the current, most recent action is the only thing that can
 * say whether Invo's client is the one managing this position right now.
 */
function decodeLiveCloidForCoin(fills: HyperliquidFill[], coin: string): string | null {
	const mostRecent = fills.filter((f) => f.coin === coin).sort((a, b) => b.time - a.time)[0];
	return mostRecent ? decodeCloidToBaseShortId(mostRecent.cloid) : null;
}

export interface ResolvedAttribution {
	baseShortId: string;
	investmentBaseId: string;
	portfolioId: string;
	trader?: string;
}

/**
 * Same-coin conflict resolution, cloid-based: decode the real live
 * position's own cloid and string-match it against candidates already
 * fetched as part of this cycle's normal investment lists - zero extra API
 * calls beyond the (shared, once-per-cycle) fills fetch, and unlike
 * mimic-resolver.ts's old isMimicked-based approach, exact rather than
 * probabilistic. Returns null (not a guess) if the cloid doesn't decode or
 * doesn't match any candidate - callers keep their existing safe fallback
 * (flag as existing_position_conflict, `npm run adopt` to resolve).
 */
export function resolveConflictByCloid(fills: HyperliquidFill[], coin: string, candidates: OpenInvestment[]): string | null {
	const baseShortId = decodeLiveCloidForCoin(fills, coin);
	if (!baseShortId) return null;
	const match = candidates.find((c) => c.baseShortId === baseShortId);
	return match?.baseId ?? null;
}

/**
 * Finds any live HL position not yet tracked, decodes its cloid, and
 * resolves trader/investment via one batched /dex/trade call - the
 * deterministic replacement for the old notification/TP-SL-based manual-
 * mimic-tracker.ts pipeline. Cache-gated: a coin already confirmed genuinely
 * manual (undecodable cloid) at its current position size costs nothing on
 * repeat cycles; `userFills`/`dex/trade` are only called when something is
 * actually unexplained.
 */
export async function discoverCloidAttributedCoins(
	/** Per-cycle memoized, not a raw HL call - PositionSync's own conflict resolution may already have fetched fills this cycle; passing the getter (rather than `hl` directly) means this never pays for a second `getUserFills()` call in the same cycle. */
	getFillsOnce: () => Promise<HyperliquidFill[]>,
	invo: InvoClient,
	positions: HyperliquidPosition[],
	state: PositionStateMap,
	cache: CloidAttributionCache,
	log: Logger,
): Promise<{ resolved: Map<string, ResolvedAttribution>; cacheChanged: boolean }> {
	const trackedCoins = new Set(Object.values(state).map((s) => s.coin));
	const untracked = positions.filter((p) => !trackedCoins.has(p.coin));

	const resolved = new Map<string, ResolvedAttribution>();
	let cacheChanged = false;

	const toCheck = untracked.filter((p) => {
		const cached = cache[p.coin];
		if (!cached) return true;
		if (cached.positionSize !== p.szi) return true; // position changed since last check - could be a new mimic
		if (cached.kind === 'resolved') {
			resolved.set(p.coin, cached);
			return false;
		}
		return false; // kind === 'manual', unchanged size - trust the cache, no recheck
	});

	if (toCheck.length === 0) return { resolved, cacheChanged };

	const fills = await getFillsOnce();

	const decodedByCoin = new Map<string, string>();
	for (const p of toCheck) {
		const baseShortId = decodeLiveCloidForCoin(fills, p.coin);
		if (baseShortId) {
			decodedByCoin.set(p.coin, baseShortId);
		} else {
			cache[p.coin] = { kind: 'manual', checkedAt: new Date().toISOString(), positionSize: p.szi };
			cacheChanged = true;
			log({ type: 'cloid_confirmed_manual', coin: p.coin, detail: 'no decodable Invo cloid on any recent fill for this coin - not a mimic, leaving untouched' });
		}
	}

	if (decodedByCoin.size === 0) return { resolved, cacheChanged };

	let statusList: any[];
	try {
		const resp = await invo.getTradeStatus(
			[...decodedByCoin.values()].map((baseShortId) => ({ baseShortId, mimicStartedAt: EPOCH })),
		);
		statusList = resp.data ?? [];
	} catch (e: any) {
		log({ type: 'error', source: 'cloid_attribution_dex_trade', message: e.message });
		return { resolved, cacheChanged };
	}

	const statusByBaseShortId = new Map(statusList.map((s) => [s.investmentBaseShortId, s]));

	for (const [coin, baseShortId] of decodedByCoin) {
		const status = statusByBaseShortId.get(baseShortId);
		if (!status) {
			// Decoded cleanly but Invo has no record of this baseShortId (e.g. a since-deleted investment) - not manual, but nothing to adopt either. Recheck next time the position changes.
			log({ type: 'cloid_decode_unresolved', coin, baseShortId, detail: 'decoded a valid-shaped cloid but /dex/trade has no record of it' });
			continue;
		}
		const position = untracked.find((p) => p.coin === coin)!;
		const entry: ResolvedAttribution & { kind: 'resolved'; checkedAt: string; positionSize: string } = {
			kind: 'resolved',
			checkedAt: new Date().toISOString(),
			positionSize: position.szi,
			baseShortId,
			investmentBaseId: status.investmentBaseId,
			portfolioId: status.portfolioId,
			trader: status.creatorAppUserId,
		};
		cache[coin] = entry;
		cacheChanged = true;
		resolved.set(coin, entry);
		log({ type: 'cloid_attributed', coin, baseShortId, investmentBaseId: status.investmentBaseId, portfolioId: status.portfolioId });
	}

	return { resolved, cacheChanged };
}
