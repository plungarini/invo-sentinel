import { ArrowUpRight, Gauge, Clock, Coins, Trophy, TrendingDown } from "lucide-react";
import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import type { AnalyticsSummary } from "@/types/ui";
import { formatDuration, formatUsd } from "@/lib/format";

export default function TradeStatsWidget({ summary }: { summary: AnalyticsSummary }) {
	const {
		totalClosedTrades,
		longCount,
		shortCount,
		longWinRate,
		shortWinRate,
		avgHoldTimeSeconds,
		totalVolumeUsd,
		bestTradeUsd,
		worstTradeUsd,
	} = summary;

	return (
		<Card title="Trade Stats">
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
				<StatTile label="Total Trades" value={totalClosedTrades} icon={Gauge} tone="accent" />
				<StatTile
					label="Long / Short"
					value={`${longCount} / ${shortCount}`}
					icon={ArrowUpRight}
					tone="neutral"
					title={`Long win rate ${longWinRate.toFixed(2)}% - Short win rate ${shortWinRate.toFixed(2)}%`}
				/>
				<StatTile
					label="Avg Hold Time"
					value={avgHoldTimeSeconds != null ? formatDuration(avgHoldTimeSeconds * 1000) : "N/A"}
					icon={Clock}
					tone="neutral"
				/>
				<StatTile label="Total Volume" value={totalVolumeUsd != null ? formatUsd(totalVolumeUsd) : "N/A"} icon={Coins} tone="neutral" />
				<StatTile
					label="Best Trade"
					value={bestTradeUsd != null ? formatUsd(bestTradeUsd) : "N/A"}
					valueClassName={bestTradeUsd != null ? "text-profit" : ""}
					icon={Trophy}
					tone={bestTradeUsd != null ? "profit" : "neutral"}
				/>
				<StatTile
					label="Worst Trade"
					value={worstTradeUsd != null ? formatUsd(worstTradeUsd) : "N/A"}
					valueClassName={worstTradeUsd != null ? "text-loss" : ""}
					icon={TrendingDown}
					tone={worstTradeUsd != null ? "loss" : "neutral"}
				/>
			</div>
		</Card>
	);
}
