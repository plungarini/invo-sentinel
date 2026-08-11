"use client";

import OverallPnlSummary from "@/components/analytics/OverallPnlSummary";
import TradeStatsWidget from "@/components/analytics/TradeStatsWidget";
import PerPortfolioTable from "@/components/analytics/PerPortfolioTable";
import ByCoinTable from "@/components/analytics/ByCoinTable";
import PnlOverTimeChart from "@/components/analytics/PnlOverTimeChart";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useTransfers } from "@/hooks/useTransfers";
import type { AnalyticsSummary } from "@/types/ui";

export default function AnalyticsClient({ initialData }: { initialData: AnalyticsSummary }) {
	const { data, error } = useAnalytics(initialData);
	const { data: transfersData } = useTransfers();

	if (error || !data) {
		return <p className="px-1 text-[15px] text-loss">Failed to load analytics.</p>;
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 pt-14 md:pb-6 md:pt-0">
			<div className="flex flex-col gap-4">
				<OverallPnlSummary summary={data} />
				<TradeStatsWidget summary={data} />
				<PnlOverTimeChart pnlOverTime={data.pnlOverTime} transfers={transfersData?.transfers} />
				<PerPortfolioTable perPortfolio={data.perPortfolio} />
				<ByCoinTable byCoin={data.byCoin} />
			</div>
		</div>
	);
}
