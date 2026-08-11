import useSWR from "swr";
import type { TradeHistoryEntry } from "@/types/ui";
import { fetcher } from "@/lib/polling";

/** Single-trade lookup for the detail modal's deep link - the trade may be beyond whatever page the History tab has paginated to. */
export function useTradeByBaseId(baseId: string | null) {
	return useSWR<{ trade: TradeHistoryEntry | null }>(
		baseId ? `/api/history?baseId=${encodeURIComponent(baseId)}` : null,
		fetcher,
	);
}
