import Badge from "@/components/shared/Badge";
import PortfolioAvatar from "@/components/layout/PortfolioAvatar";
import { formatDuration, formatPct, formatUsd } from "@/lib/format";
import type { FollowedPortfolioSummary } from "@/server/daemon/loadFollowedPortfolios";
import { BadgeCheck } from "lucide-react";

function DetailRow({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<span className="text-[14px] text-text-muted">{label}</span>
			<span className={`truncate text-[15px] font-semibold tabular-nums ${valueClassName}`}>{value}</span>
		</div>
	);
}

/**
 * The full portfolio stats block - avatar, PnL, win rate, everything Invo's
 * own `get_portfolio_by_id`/`get_users_followed_portfolios` return. Shared by
 * the Followed Portfolios rail's modal and the standalone Portfolio Analysis
 * tool so the two can never drift into showing different information for the
 * same portfolio.
 */
export default function PortfolioStatsBody({
	portfolio,
	statusBadge,
}: {
	portfolio: FollowedPortfolioSummary;
	statusBadge?: React.ReactNode;
}) {
	const pnlClass = portfolio.plSnapshot == null ? "" : portfolio.plSnapshot >= 0 ? "text-profit" : "text-loss";

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-col items-center gap-2 py-2 text-center">
				<PortfolioAvatar
					title={portfolio.title}
					avatarUrl={portfolio.ownerAvatarUrl}
					avatarColor={portfolio.ownerAvatarColor}
					size={11}
				/>
				<div className="flex items-center gap-1.5">
					<span className="text-[19px] font-bold tracking-tight">{portfolio.title.trim()}</span>
					{portfolio.ownerVerified && <BadgeCheck className="h-[18px] w-[18px] text-accent" strokeWidth={2.25} />}
				</div>
				{portfolio.ownerUsername && <span className="text-[13px] text-text-muted">@{portfolio.ownerUsername}</span>}
				{portfolio.plSnapshot != null && (
					<span className={`mt-1 text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums ${pnlClass}`}>
						{portfolio.plSnapshot >= 0 ? "+" : ""}
						{formatUsd(portfolio.plSnapshot)}
					</span>
				)}
				<div className="flex items-center gap-2">
					{statusBadge}
					{portfolio.liquidated && <Badge tone="loss">Liquidated</Badge>}
				</div>
			</div>

			{portfolio.description && (
				<p className="rounded-xl bg-surface px-4 py-3 text-[14px] text-text-muted">{portfolio.description}</p>
			)}

			<div className="divide-y divide-bg rounded-xl bg-surface">
				<DetailRow label="Win Rate" value={portfolio.winRate != null ? `${portfolio.winRate.toFixed(2)}%` : "N/A"} />
				<DetailRow
					label="Closed Positions"
					value={portfolio.closedPositions != null ? `${portfolio.closedPositions}` : "N/A"}
				/>
				<DetailRow label="Open Positions" value={portfolio.openPositions != null ? `${portfolio.openPositions}` : "N/A"} />
				<DetailRow
					label="Won / Lost"
					value={
						portfolio.wonPositions != null && portfolio.lostPositions != null
							? `${portfolio.wonPositions} / ${portfolio.lostPositions}`
							: "N/A"
					}
				/>
				<DetailRow
					label="Avg PnL (Realized)"
					value={portfolio.avgPlRealized != null ? formatPct(portfolio.avgPlRealized) : "N/A"}
					valueClassName={portfolio.avgPlRealized == null ? "" : portfolio.avgPlRealized >= 0 ? "text-profit" : "text-loss"}
				/>
				<DetailRow
					label="Avg Hold Time"
					value={portfolio.avgHoldTimeSeconds != null ? formatDuration(portfolio.avgHoldTimeSeconds * 1000) : "N/A"}
				/>
				<DetailRow
					label="Current Win Streak"
					value={portfolio.currentWinStreak != null ? `${portfolio.currentWinStreak}` : "N/A"}
				/>
				<DetailRow
					label="Followers"
					value={portfolio.followerCount != null ? portfolio.followerCount.toLocaleString("en-US") : "N/A"}
				/>
			</div>

			{portfolio.minMarginPct != null && portfolio.maxMarginPct != null && (
				<div className="rounded-xl bg-surface px-4 py-3">
					<div className="flex items-center justify-between gap-4">
						<span className="text-[14px] text-text-muted">Your Risk Override</span>
						<Badge tone="amber">
							{portfolio.minMarginPct}-{portfolio.maxMarginPct}%
						</Badge>
					</div>
				</div>
			)}
		</div>
	);
}
