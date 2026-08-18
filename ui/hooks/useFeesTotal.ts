import useSWR from "swr";
import { fetcher, ANALYTICS_REFRESH_MS } from "@/lib/polling";

/**
 * Fees-only figure for the Total Balance banner, shared by Overview and
 * Wallet under one SWR key - deliberately not useAnalytics: that hook also
 * triggers a live HL positions fetch and full trade-history aggregation on
 * every page that reads it, which this one number doesn't need.
 */
export function useFeesTotal(fallbackData?: { totalFeesUsd: number }) {
	return useSWR<{ totalFeesUsd: number }>("/api/history?feesOnly=1", fetcher, {
		refreshInterval: ANALYTICS_REFRESH_MS,
		fallbackData,
	});
}
