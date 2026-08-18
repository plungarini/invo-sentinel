"use client";

import { useMemo, useState } from "react";
import OverallPnlSummary from "@/components/analytics/OverallPnlSummary";
import TradeStatsWidget from "@/components/analytics/TradeStatsWidget";
import PerPortfolioTable from "@/components/analytics/PerPortfolioTable";
import ByCoinTable from "@/components/analytics/ByCoinTable";
import PnlOverTimeChart from "@/components/analytics/PnlOverTimeChart";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useTransfers } from "@/hooks/useTransfers";
import { periodStart, DEFAULT_ANALYTICS_PERIOD } from "@/lib/analyticsPeriod";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";

export default function AnalyticsClient({ initialData }: { initialData: AnalyticsSummary }) {
	const [period, setPeriod] = useState<AnalyticsPeriod>(DEFAULT_ANALYTICS_PERIOD);
	const { data, error } = useAnalytics(period, initialData);
	const { data: transfersData } = useTransfers();

	// Keeps transfer markers scoped to the same window as the chart itself - without this, an
	// old deposit could get snapped onto a "Today"-filtered chart's only nearby point and look
	// like it happened today.
	const transfersInPeriod = useMemo(() => {
		const start = periodStart(period, new Date());
		if (!start || !transfersData?.transfers) return transfersData?.transfers;
		const startMs = start.getTime();
		return transfersData.transfers.filter((t) => t.time >= startMs);
	}, [transfersData?.transfers, period]);

	// Each widget below owns its own loading/error rendering (see their `!summary`/`!byCoin`/etc.
	// branches) instead of this component gating the whole page behind one `if (!data)` - that
	// way any one section can be maintained, reskinned, or given its own fetch without the others
	// re-rendering or flickering. `data` is only ever undefined here on a genuine cold start,
	// thanks to `keepPreviousData` in useAnalytics - a period switch never blanks the page.
	return (
		<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 pt-14 md:pb-6 md:pt-0">
			<div className="flex flex-col gap-4">
				<OverallPnlSummary summary={data} hasError={!!error} period={period} onPeriodChange={setPeriod} />
				<TradeStatsWidget summary={data} hasError={!!error} />
				<PnlOverTimeChart pnlOverTime={data?.pnlOverTime} transfers={transfersInPeriod} hasError={!!error} />
				<PerPortfolioTable perPortfolio={data?.perPortfolio} hasError={!!error} />
				<ByCoinTable byCoin={data?.byCoin} hasError={!!error} />
			</div>
		</div>
	);
}
