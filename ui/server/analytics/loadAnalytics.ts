import "server-only";
import { loadHistory } from "../history/loadHistory";
import { aggregateAnalytics } from "./aggregateAnalytics";
import type { AnalyticsSummary } from "@/types/ui";

/** Shared by the /api/analytics route and the Analytics page's SSR initial fetch. */
export async function loadAnalytics(): Promise<AnalyticsSummary> {
	const { trades } = await loadHistory();
	return aggregateAnalytics(trades);
}
