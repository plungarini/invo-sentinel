import "server-only";
import { readIgnoredTrades } from "./readIgnored";
import { readTrackedState } from "./readState";
import { readLatestCycleStatus } from "./computeStatus";
import { getInvoClient } from "../invo/client";
import type { StatusResponse } from "@/hooks/useCycleStatus";

/** Shared by the /api/status route and the Overview page's server-side initial fetch, so first paint never shows a loading flash. */
export function loadStatus(): StatusResponse {
	const trackedState = readTrackedState();
	const ignoredTrades = readIgnoredTrades();
	const { cycle, recentErrors, recentActivity } = readLatestCycleStatus();

	let tokenDaysRemaining: number | null = null;
	try {
		tokenDaysRemaining = getInvoClient().refreshTokenDaysRemaining();
	} catch {
		tokenDaysRemaining = null;
	}

	return {
		cycle,
		trackedCount: Object.keys(trackedState).length,
		ignoredCount: Object.keys(ignoredTrades).length,
		tokenDaysRemaining,
		recentErrors,
		recentActivity,
	};
}
