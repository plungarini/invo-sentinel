import useSWR from "swr";
import { fetcher } from "@/lib/polling";

/** Cheap total-fees figure - doesn't require fetching every trade's full lifecycle. */
export function useHistoryFeesTotal(enabled: boolean = true) {
	return useSWR<{ totalFeesUsd: number }>(enabled ? "/api/history?feesOnly=1" : null, fetcher);
}
