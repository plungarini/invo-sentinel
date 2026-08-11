import Card from "@/components/shared/Card";
import type { PortfolioPnlBreakdown } from "@/types/ui";
import { formatPct, formatUsd } from "@/lib/format";

const AVATAR_TONES = [
	"bg-accent/20 text-accent",
	"bg-profit/20 text-profit",
	"bg-badge-amber/20 text-badge-amber",
	"bg-loss/20 text-loss",
];

export default function PerPortfolioTable({ perPortfolio }: { perPortfolio: PortfolioPnlBreakdown[] }) {
	if (perPortfolio.length === 0) {
		return (
			<Card title="By Portfolio">
				<p className="px-1 py-8 text-center text-[14px] text-text-muted">No closed trades yet.</p>
			</Card>
		);
	}

	return (
		<Card title="By Portfolio">
			<div className="flex flex-col gap-2.5">
				{perPortfolio.map((p, i) => {
					const hasAvgPercent = p.determinedPnlPercentTradeCount > 0;
					return (
						<div key={p.name} className="rounded-xl border border-border bg-surface px-4 py-3.5">
							<div className="flex items-center gap-3">
								<span
									className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
								>
									{p.name.trim().slice(0, 2).toUpperCase()}
								</span>
								<span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{p.name}</span>
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
				})}
			</div>
		</Card>
	);
}
