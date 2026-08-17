"use client";

import Link from "next/link";
import { useCycleStatus, type StatusResponse } from "@/hooks/useCycleStatus";
import { useWallet, type WalletResponse } from "@/hooks/useWallet";
import { useAnalytics } from "@/hooks/useAnalytics";
import Card from "@/components/shared/Card";
import BigNumber from "@/components/shared/BigNumber";
import CycleStatusWidget from "@/components/homepage/CycleStatusWidget";
import TokenExpiryWidget from "@/components/homepage/TokenExpiryWidget";
import AgentKeyExpiryWidget from "@/components/homepage/AgentKeyExpiryWidget";
import DaemonHealthWidget from "@/components/homepage/DaemonHealthWidget";
import BalanceChange24hBadge from "@/components/shared/BalanceChange24hBadge";
import RecentActivityWidget from "@/components/homepage/RecentActivityWidget";
import { formatUsd } from "@/lib/format";
import type { AnalyticsSummary } from "@/types/ui";

export default function OverviewClient({
	initialStatus,
	initialWallet,
	initialAnalytics,
}: {
	initialStatus: StatusResponse;
	initialWallet?: WalletResponse;
	initialAnalytics?: AnalyticsSummary;
}) {
	const { data, error } = useCycleStatus(initialStatus);
	const { data: wallet } = useWallet(initialWallet);
	const { data: analytics } = useAnalytics("all", initialAnalytics);

	if (!data) {
		return <p className="px-1 text-[15px] text-text-muted">{error ? "Failed to load status." : "Loading…"}</p>;
	}

	return (
		<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 pt-14 md:pb-6 md:pt-0">
			<div className="flex flex-col gap-4">
				{/* Snapshot - the actual "at a glance" overview: balance, open exposure, all-time performance */}
				<Card>
					<div className="flex flex-wrap items-end justify-between gap-4">
						<div>
							<p className="text-[15px] text-text-muted">Total Balance</p>
							<BigNumber
								value={wallet?.accountValueUsd ?? 0}
								className="mt-1 block text-[36px] font-bold leading-none"
							/>
							<BalanceChange24hBadge />
						</div>
						<Link
							href="/wallet"
							className="inline-flex items-center justify-center gap-2 rounded-xl bg-surface px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-150 ease-out hover:bg-surface-hover active:scale-[0.97]"
						>
							View wallet →
						</Link>
					</div>
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
				</Card>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<CycleStatusWidget cycle={data.cycle} />
					<DaemonHealthWidget cycle={data.cycle} />
					<TokenExpiryWidget tokenDaysRemaining={data.tokenDaysRemaining} />
					<AgentKeyExpiryWidget />
				</div>

				<RecentActivityWidget activity={data.recentActivity} />
			</div>
		</div>
	);
}
