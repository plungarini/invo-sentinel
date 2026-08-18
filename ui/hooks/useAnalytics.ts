import useSWR from "swr";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";
import { fetcher, ANALYTICS_REFRESH_MS } from "@/lib/polling";

export function useAnalytics(period: AnalyticsPeriod = "all", fallbackData?: AnalyticsSummary) {
	// fallbackData only ever matches the "all" period (the SSR page's initial fetch) - passing
	// it for a non-"all" key would flash stale, wrongly-scoped stats before the real fetch lands.
	// keepPreviousData means switching period never drops back to `data: undefined` mid-flight -
	// the previous period's numbers stay on screen (better than a blank/error flash) until the
	// new period's real data arrives, `isValidating` distinguishes "showing stale" from "idle".
	return useSWR<AnalyticsSummary>(`/api/analytics?period=${period}`, fetcher, {
		refreshInterval: ANALYTICS_REFRESH_MS,
		fallbackData: period === "all" ? fallbackData : undefined,
		keepPreviousData: true,
	});
}
