import useSWR from "swr";
import type { AnalyticsSummary } from "@/types/ui";
import { fetcher, ANALYTICS_REFRESH_MS } from "@/lib/polling";

export function useAnalytics(fallbackData?: AnalyticsSummary) {
	return useSWR<AnalyticsSummary>("/api/analytics", fetcher, { refreshInterval: ANALYTICS_REFRESH_MS, fallbackData });
}
