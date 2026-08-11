import useSWR from "swr";
import type { HyperliquidLedgerUpdate } from "@daemon/types.js";
import { fetcher, TRANSFERS_REFRESH_MS } from "@/lib/polling";

export interface TransfersResponse {
	transfers: HyperliquidLedgerUpdate[];
}

export function useTransfers(fallbackData?: TransfersResponse, enabled = true) {
	return useSWR<TransfersResponse>(enabled ? "/api/transfers" : null, fetcher, {
		refreshInterval: TRANSFERS_REFRESH_MS,
		fallbackData,
	});
}
