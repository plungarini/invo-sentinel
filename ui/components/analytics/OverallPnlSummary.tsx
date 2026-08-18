"use client";

import { DollarSign, TrendingUp, Percent } from "lucide-react";
import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import Skeleton from "@/components/shared/Skeleton";
import AnalyticsPeriodSelector from "@/components/analytics/AnalyticsPeriodSelector";
import type { AnalyticsPeriod, AnalyticsSummary } from "@/types/ui";
import { formatPct, formatUsd } from "@/lib/format";

export default function OverallPnlSummary({
	summary,
	hasError,
	period,
	onPeriodChange,
}: {
	summary?: AnalyticsSummary;
	hasError?: boolean;
	period: AnalyticsPeriod;
	onPeriodChange: (period: AnalyticsPeriod) => void;
}) {
	const selector = <AnalyticsPeriodSelector period={period} onChange={onPeriodChange} />;

	if (!summary) {
		return (
			<Card title="Overview" action={selector}>
				{hasError ? (
					<p className="text-[14px] text-loss">Failed to load analytics.</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={i} className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
								<div className="flex-1">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="mt-2 h-5 w-24" />
								</div>
							</div>
						))}
					</div>
				)}
			</Card>
		);
	}

	const { totalPnlUsd, openPnlUsd, totalFeesUsd, winRate, avgPnlPercent, determinedPnlPercentTradeCount } = summary;
	const hasAvgPercent = determinedPnlPercentTradeCount > 0;
	const netPnlUsd = totalPnlUsd + openPnlUsd - totalFeesUsd;

	return (
		<Card title="Overview" action={selector}>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatTile
					label="Total PnL"
					value={formatUsd(netPnlUsd)}
					valueClassName={netPnlUsd >= 0 ? "text-profit" : "text-loss"}
					icon={DollarSign}
					tone={netPnlUsd >= 0 ? "profit" : "loss"}
					title={`Closed ${formatUsd(totalPnlUsd)} + open ${formatUsd(openPnlUsd)}${totalFeesUsd > 0 ? ` - ${formatUsd(totalFeesUsd)} fees` : ""}`}
				/>
				<StatTile label="Win Rate" value={`${winRate.toFixed(2)}%`} icon={TrendingUp} tone="accent" />
				<StatTile
					label="Avg PnL %"
					value={hasAvgPercent ? formatPct(avgPnlPercent) : "N/A"}
					valueClassName={hasAvgPercent ? (avgPnlPercent >= 0 ? "text-profit" : "text-loss") : "text-text-muted"}
					icon={Percent}
					tone={hasAvgPercent ? (avgPnlPercent >= 0 ? "profit" : "loss") : "neutral"}
				/>
			</div>
		</Card>
	);
}
