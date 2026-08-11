import Card from "@/components/shared/Card";
import type { CoinPnlBreakdown } from "@/types/ui";
import { formatUsd } from "@/lib/format";

export default function ByCoinTable({ byCoin }: { byCoin: CoinPnlBreakdown[] }) {
	if (byCoin.length === 0) {
		return (
			<Card title="By Coin">
				<p className="px-1 py-8 text-center text-[14px] text-text-muted">No closed trades yet.</p>
			</Card>
		);
	}

	return (
		<Card title="By Coin">
			<div className="flex flex-col gap-2.5">
				{byCoin.map((c) => (
					<div key={c.coin} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
						<span className="text-[15px] font-semibold">{c.coin}</span>
						<div className="flex shrink-0 items-center gap-5">
							<div className="text-right">
								<p className="text-[12px] text-text-muted">Trades</p>
								<p className="text-[14px] font-semibold tabular-nums">{c.tradeCount}</p>
							</div>
							<div className="text-right">
								<p className="text-[12px] text-text-muted">Win Rate</p>
								<p className="text-[14px] font-semibold tabular-nums">{c.winRate.toFixed(2)}%</p>
							</div>
							<div className="w-20 text-right">
								<p className="text-[12px] text-text-muted">P/L</p>
								<p className={`text-[14px] font-semibold tabular-nums ${c.totalPnlUsd >= 0 ? "text-profit" : "text-loss"}`}>
									{c.totalPnlUsd >= 0 ? "+" : ""}
									{formatUsd(c.totalPnlUsd)}
								</p>
							</div>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
