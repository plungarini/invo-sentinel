import useSWR from "swr";
import type { TradeHistoryEntry } from "@/types/ui";
import { fetcher, HISTORY_REFRESH_MS } from "@/lib/polling";

export interface TradeHistoryResponse {
	trades: TradeHistoryEntry[];
}

export function useTradeHistory(fallbackData?: TradeHistoryResponse, enabled = true) {
	return useSWR<TradeHistoryResponse>(enabled ? "/api/history" : null, fetcher, {
		refreshInterval: HISTORY_REFRESH_MS,
		fallbackData,
	});
}
