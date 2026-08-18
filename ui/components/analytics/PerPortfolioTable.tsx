"use client";

import { useState } from "react";
import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import PortfolioAvatar from "@/components/layout/PortfolioAvatar";
import type { PortfolioPnlBreakdown } from "@/types/ui";
import { formatPct, formatUsd } from "@/lib/format";

export default function PerPortfolioTable({
	perPortfolio,
	hasError,
}: {
	perPortfolio?: PortfolioPnlBreakdown[];
	hasError?: boolean;
}) {
	const [query, setQuery] = useState("");

	if (!perPortfolio) {
		return (
			<Card title="By Portfolio">
				{hasError ? (
					<p className="text-[14px] text-loss">Failed to load analytics.</p>
				) : (
					<div className="flex flex-col gap-2.5">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-[104px] w-full rounded-xl" />
						))}
					</div>
				)}
			</Card>
		);
	}

	if (perPortfolio.length === 0) {
		return (
			<Card title="By Portfolio">
				<p className="px-1 py-8 text-center text-[14px] text-text-muted">No closed trades yet.</p>
			</Card>
		);
	}

	const filtered = perPortfolio.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

	return (
		<Card title="By Portfolio">
			<input
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder="Search portfolios..."
				className="mb-3 w-full rounded-xl bg-surface px-4 py-2.5 text-[14px] outline-none placeholder:text-text-muted focus:ring-2 focus:ring-accent"
			/>
			<div className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1">
				{filtered.length === 0 ? (
					<p className="px-1 py-8 text-center text-[14px] text-text-muted">No portfolios match "{query}".</p>
				) : (
					filtered.map((p) => {
						const hasAvgPercent = p.determinedPnlPercentTradeCount > 0;
						return (
							<div key={p.portfolioId ?? p.name} className="rounded-xl border border-border bg-surface px-4 py-3.5">
								<div className="flex items-center gap-3">
									<PortfolioAvatar title={p.name} avatarUrl={p.ownerAvatarUrl} avatarColor={p.ownerAvatarColor} />
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-[15px] font-semibold leading-tight">{p.name}</span>
										{p.ownerUsername && <span className="truncate text-[13px] text-text-muted">@{p.ownerUsername}</span>}
									</div>
									<div className="flex shrink-0 flex-col items-end">
										<span className="text-[13px] text-text-muted">Profit / Loss</span>
										<span
											className={`text-[17px] font-bold tabular-nums ${p.totalPnlUsd >= 0 ? "text-profit" : "text-loss"}`}
										>
											{p.totalPnlUsd >= 0 ? "+" : ""}
											{formatUsd(p.totalPnlUsd)}
										</span>
									</div>
								</div>

								<div className="mt-3 flex items-start justify-between gap-2 border-t border-border pt-3">
									<div className="shrink-0">
										<p className="text-[12px] text-text-muted">Trades</p>
										<p className="text-[15px] font-semibold tabular-nums">{p.tradeCount}</p>
									</div>
									<div className="shrink-0">
										<p className="text-[12px] text-text-muted">Win Rate</p>
										<p className="text-[15px] font-semibold tabular-nums">{p.winRate.toFixed(2)}%</p>
									</div>
									<div className="shrink-0 text-right">
										<p className="text-[12px] text-text-muted">Avg PnL %</p>
										<p
											className={`text-[15px] font-semibold tabular-nums ${!hasAvgPercent ? "text-text-muted" : p.avgPnlPercent >= 0 ? "text-profit" : "text-loss"}`}
										>
											{hasAvgPercent ? formatPct(p.avgPnlPercent) : "N/A"}
										</p>
									</div>
								</div>
							</div>
						);
					})
				)}
			</div>
		</Card>
	);
}
