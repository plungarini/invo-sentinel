import useSWR from "swr";
import { fetcher, STATUS_REFRESH_MS } from "@/lib/polling";
import type { CycleStatus, RecentActivityEntry } from "@/server/daemon/computeStatus";

export interface StatusResponse {
	cycle: CycleStatus;
	trackedCount: number;
	ignoredCount: number;
	tokenDaysRemaining: number | null;
	recentActivity: RecentActivityEntry[];
}

export function useCycleStatus(fallbackData?: StatusResponse) {
	return useSWR<StatusResponse>("/api/status", fetcher, { refreshInterval: STATUS_REFRESH_MS, fallbackData });
}
