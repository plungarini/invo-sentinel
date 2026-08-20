"use client";

import { useCycleStatus, type StatusResponse } from "@/hooks/useCycleStatus";
import { useWallet, type WalletResponse } from "@/hooks/useWallet";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useFeesTotal } from "@/hooks/useFeesTotal";
import TotalBalanceCard from "@/components/shared/TotalBalanceCard";
import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import CycleStatusWidget from "@/components/homepage/CycleStatusWidget";
import TokenExpiryWidget from "@/components/homepage/TokenExpiryWidget";
import AgentKeyExpiryWidget from "@/components/homepage/AgentKeyExpiryWidget";
import DaemonHealthWidget from "@/components/homepage/DaemonHealthWidget";
import AvgPollTimeWidget from "@/components/homepage/AvgPollTimeWidget";
import TrackedPositionsWidget from "@/components/homepage/TrackedPositionsWidget";
import RecentActivityWidget from "@/components/homepage/RecentActivityWidget";
import { formatUsd } from "@/lib/format";
import type { AnalyticsSummary } from "@/types/ui";

/** Matches a single-StatTile Card's rough footprint while cycle status is still loading. */
function WidgetSkeleton() {
	return (
		<Card>
			<div className="flex items-center gap-3">
				<Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
				<div className="flex-1">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="mt-2 h-4 w-24" />
				</div>
			</div>
		</Card>
	);
}

export default function OverviewClient({
	initialStatus,
	initialWallet,
	initialAnalytics,
	initialFees,
}: {
	initialStatus: StatusResponse;
	initialWallet?: WalletResponse;
	initialAnalytics?: AnalyticsSummary;
	initialFees?: { totalFeesUsd: number };
}) {
	const { data, error } = useCycleStatus(initialStatus);
	const { data: wallet } = useWallet(initialWallet);
	// Footer (All-time PnL/Win Rate) genuinely needs the full aggregation; the
	// Fees stat below uses the lightweight, Wallet-shared useFeesTotal instead.
	const { data: analytics } = useAnalytics("all", initialAnalytics);
	const { data: feesData } = useFeesTotal(initialFees);

	// The balance banner only ever depends on `wallet`/`analytics`/`feesData`,
	// each already independently optional below - it renders regardless of
	// `data` (cycle status). Only the cycle-status-driven widgets below it
	// need a loading/error swap.
	return (
		<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 pt-14 md:pb-6 md:pt-0">
			<div className="flex flex-col gap-4">
				{/* Snapshot - the actual "at a glance" overview: balance, open exposure, all-time performance */}
				<TotalBalanceCard
					size="sm"
					accountValueUsd={wallet?.accountValueUsd ?? 0}
					availableUsd={
						wallet ? wallet.accountValueUsd - wallet.positions.reduce((sum, p) => sum + parseFloat(p.marginUsed), 0) : undefined
					}
					feesUsd={feesData?.totalFeesUsd}
					footer={
						<div className="mt-4 flex items-start justify-between gap-2 border-t border-border pt-4">
							<div className="shrink-0">
								<p className="text-[12px] text-text-muted">Open Positions</p>
								<p className="text-[20px] font-bold tabular-nums tracking-[-0.02em]">
									{wallet ? wallet.positions.length : "N/A"}
								</p>
							</div>
							<div className="shrink-0">
								<p className="text-[12px] text-text-muted">All-time PnL</p>
								<p
									className={`text-[20px] font-bold tabular-nums tracking-[-0.02em] ${
										analytics ? (analytics.totalPnlUsd - analytics.totalFeesUsd >= 0 ? "text-profit" : "text-loss") : ""
									}`}
									title={analytics && analytics.totalFeesUsd > 0 ? `Net of ${formatUsd(analytics.totalFeesUsd)} in fees` : undefined}
								>
									{analytics ? formatUsd(analytics.totalPnlUsd - analytics.totalFeesUsd) : "N/A"}
								</p>
							</div>
							<div className="shrink-0 text-right">
								<p className="text-[12px] text-text-muted">Win Rate</p>
								<p className="text-[20px] font-bold tabular-nums tracking-[-0.02em]">
									{analytics ? `${analytics.winRate.toFixed(2)}%` : "N/A"}
								</p>
							</div>
						</div>
					}
				/>

				{data ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<CycleStatusWidget cycle={data.cycle} />
						<DaemonHealthWidget cycle={data.cycle} />
						<AvgPollTimeWidget
							avgPollDurationMs={data.avgPollDurationMs}
							avgPollSampleCount={data.avgPollSampleCount}
							pollIntervalMs={data.pollIntervalMs}
						/>
						<TrackedPositionsWidget trackedCount={data.trackedCount} />
						<TokenExpiryWidget tokenDaysRemaining={data.tokenDaysRemaining} />
						<AgentKeyExpiryWidget />
					</div>
				) : error ? (
					<p className="px-1 text-[15px] text-text-muted">Failed to load status.</p>
				) : (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<WidgetSkeleton />
						<WidgetSkeleton />
						<WidgetSkeleton />
						<WidgetSkeleton />
						<AgentKeyExpiryWidget />
						<WidgetSkeleton />
					</div>
				)}

				{data && <RecentActivityWidget activity={data.recentActivity} />}
			</div>
		</div>
	);
}
