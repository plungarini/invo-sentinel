import "server-only";
import { getHyperliquidClient } from "./client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";

const CACHE_TTL_MS = 5 * 60_000; // the 24h baseline barely moves minute to minute - no need to poll HL tightly for this

export interface BalanceChange24h {
	changeUsd: number;
	changePercent: number;
}

async function fetchBalanceChange24h(): Promise<BalanceChange24h | null> {
	const hl = await getHyperliquidClient();
	const [current, history] = await Promise.all([hl.getAccountValueUsd(), hl.getDailyAccountValueHistory()]);
	if (history.length === 0) return null;

	const past = history[0].accountValueUsd;
	if (past === 0) return null; // avoid a divide-by-zero on a brand-new account

	return { changeUsd: current - past, changePercent: ((current - past) / past) * 100 };
}

/** Shared by /api/balance-change and any future SSR consumer. */
export const loadBalanceChange24h = staleWhileRevalidate(fetchBalanceChange24h, CACHE_TTL_MS);
