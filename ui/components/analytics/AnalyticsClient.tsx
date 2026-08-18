"use client";

import { useMemo, useState } from "react";
import OverallPnlSummary from "@/components/analytics/OverallPnlSummary";
import TradeStatsWidget from "@/components/analytics/TradeStatsWidget";
import PerPortfolioTable from "@/components/analytics/PerPortfolioTable";
import ByCoinTable from "@/components/analytics/ByCoinTable";
import PnlOverTimeChart from "@/components/analytics/PnlOverTimeChart";
import AnalyticsPeriodSelector from "@/components/analytics/AnalyticsPeriodSelector";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useTransfers } from "@/hooks/useTransfers";
import { periodStart } from "@/lib/analyticsPeriod";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";

export default function AnalyticsClient({ initialData }: { initialData: AnalyticsSummary }) {
	const [period, setPeriod] = useState<AnalyticsPeriod>("all");
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

	if (error || !data) {
		return <p className="px-1 text-[15px] text-loss">Failed to load analytics.</p>;
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 pt-14 md:pb-6 md:pt-0">
			<div className="flex flex-col gap-4">
				<OverallPnlSummary summary={data} />
				<TradeStatsWidget summary={data} />
				<PnlOverTimeChart
					pnlOverTime={data.pnlOverTime}
					transfers={transfersInPeriod}
					periodSelector={<AnalyticsPeriodSelector period={period} onChange={setPeriod} />}
				/>
				<PerPortfolioTable perPortfolio={data.perPortfolio} />
				<ByCoinTable byCoin={data.byCoin} />
			</div>
		</div>
	);
}
