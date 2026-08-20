import "server-only";
import { readIgnoredTrades } from "./readIgnored";
import { readTrackedState } from "./readState";
import { readLatestCycleStatus, readAvgPollDuration } from "./computeStatus";
import { getInvoClient } from "../invo/client";
import { getAppConfig } from "./paths";
import type { StatusResponse } from "@/hooks/useCycleStatus";

/** Shared by the /api/status route and the Overview page's server-side initial fetch, so first paint never shows a loading flash. */
export async function loadStatus(): Promise<StatusResponse> {
	const trackedState = readTrackedState();
	const ignoredTrades = readIgnoredTrades();
	const { cycle, recentActivity } = readLatestCycleStatus();
	const { avgMs: avgPollDurationMs, sampleCount: avgPollSampleCount } = readAvgPollDuration();
	const config = await getAppConfig();

	let tokenDaysRemaining: number | null = null;
	try {
		tokenDaysRemaining = (await getInvoClient()).refreshTokenDaysRemaining();
	} catch {
		tokenDaysRemaining = null;
	}

	return {
		cycle,
		trackedCount: Object.keys(trackedState).length,
		ignoredCount: Object.keys(ignoredTrades).length,
		tokenDaysRemaining,
		recentActivity,
		avgPollDurationMs,
		avgPollSampleCount,
		pollIntervalMs: config.pollIntervalMs,
	};
}
