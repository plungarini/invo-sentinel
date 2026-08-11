import { DollarSign, TrendingUp, Percent } from "lucide-react";
import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import type { AnalyticsSummary } from "@/types/ui";
import { formatPct, formatUsd } from "@/lib/format";

export default function OverallPnlSummary({ summary }: { summary: AnalyticsSummary }) {
	const { totalPnlUsd, totalFeesUsd, winRate, avgPnlPercent, determinedPnlPercentTradeCount } = summary;
	const hasAvgPercent = determinedPnlPercentTradeCount > 0;
	const netPnlUsd = totalPnlUsd - totalFeesUsd;

	return (
		<Card title="Overview">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatTile
					label="Total PnL"
					value={formatUsd(netPnlUsd)}
					valueClassName={netPnlUsd >= 0 ? "text-profit" : "text-loss"}
					icon={DollarSign}
					tone={netPnlUsd >= 0 ? "profit" : "loss"}
					title={totalFeesUsd > 0 ? `Net of ${formatUsd(totalFeesUsd)} in fees (${formatUsd(totalPnlUsd)} before fees)` : undefined}
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
