import "server-only";
import { getHyperliquidClient } from "./client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";

const CACHE_TTL_MS = 60_000; // a coarse "last touched" signal - no need to refetch the full fills history every 2s wallet poll tick
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000; // "last touched" is only ever shown for currently-open positions, so a fill older than this isn't a live position's most recent touch anyway

async function fetchLastFillTimes(): Promise<Record<string, number>> {
	const hl = await getHyperliquidClient();
	const fills = await hl.getUserFillsSince(Date.now() - LOOKBACK_MS);
	const lastByCoin: Record<string, number> = {};
	for (const fill of fills) {
		if (!lastByCoin[fill.coin] || fill.time > lastByCoin[fill.coin]) lastByCoin[fill.coin] = fill.time;
	}
	return lastByCoin;
}

/**
 * Most recent real fill per coin, straight from HL's own fill history - the
 * best available "position last touched" signal for a coin this specific
 * daemon instance isn't tracking (no local `openedAt` to fall back on for
 * those - e.g. manually-opened positions, or ones opened before this daemon
 * started watching this account at all).
 */
export const loadLastFillTimes = staleWhileRevalidate(fetchLastFillTimes, CACHE_TTL_MS);
