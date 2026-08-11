import "server-only";
import type { HyperliquidLedgerUpdate } from "@daemon/types.js";
import { getHyperliquidClient } from "./client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";

const CACHE_TTL_MS = 60_000; // deposits/withdrawals are rare - no need to poll as tightly as positions

async function fetchTransfers(): Promise<{ transfers: HyperliquidLedgerUpdate[] }> {
	const hl = await getHyperliquidClient();
	const transfers = await hl.getLedgerUpdates();
	return { transfers: [...transfers].sort((a, b) => b.time - a.time) };
}

/** Shared by /api/transfers and the Wallet page's server-side initial fetch. */
export const loadTransfers = staleWhileRevalidate(fetchTransfers, CACHE_TTL_MS);
