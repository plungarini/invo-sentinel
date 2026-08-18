import { ArrowUpRight, Gauge, Clock, Coins, Trophy, TrendingDown } from "lucide-react";
import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import Skeleton from "@/components/shared/Skeleton";
import type { AnalyticsSummary } from "@/types/ui";
import { formatDuration, formatUsd } from "@/lib/format";

export default function TradeStatsWidget({ summary, hasError }: { summary?: AnalyticsSummary; hasError?: boolean }) {
	if (!summary) {
		return (
			<Card title="Trade Stats">
				{hasError ? (
					<p className="text-[14px] text-loss">Failed to load analytics.</p>
				) : (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
								<div className="flex-1">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="mt-2 h-5 w-20" />
								</div>
							</div>
						))}
					</div>
				)}
			</Card>
		);
	}

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
