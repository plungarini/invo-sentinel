import Badge from "@/components/shared/Badge";
import { formatDuration, formatPct, formatUsd, timeAgo } from "@/lib/format";
import type { TradeHistoryEntry } from "@/types/ui";

export default function TradeRow({ trade, onSelect }: { trade: TradeHistoryEntry; onSelect: (baseId: string) => void }) {
	const time = trade.status === "open" ? trade.openedAt : trade.closedAt;
	const direction = trade.isBuy === undefined ? undefined : trade.isBuy ? "Long" : "Short";

	const openedMs = trade.openedAt ? Date.parse(trade.openedAt) : NaN;
	const closedMs = trade.closedAt ? Date.parse(trade.closedAt) : NaN;
	const durationMs = trade.status === "closed" ? closedMs - openedMs : Date.now() - openedMs;
	const duration = Number.isFinite(durationMs) ? formatDuration(durationMs) : undefined;

	const pnlClass = trade.pnlUsd == null ? "text-text-muted" : trade.pnlUsd >= 0 ? "text-profit" : "text-loss";

	return (
		<button
			onClick={() => onSelect(trade.baseId)}
			className="w-full cursor-pointer rounded-xl bg-surface px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-hover"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<span className="text-[17px] font-bold tracking-tight">{trade.coin}</span>
						{trade.status === "open" && <Badge tone="amber">Open</Badge>}
						{trade.closeReason === "Liquidated" && <Badge tone="loss">Liquidated</Badge>}
					</div>
					<p className="mt-1 truncate text-[13px] text-text-muted">
						{direction ?? "N/A"}
						{trade.leverage != null ? ` ${trade.leverage}X` : ""} · {time ? timeAgo(time) : "N/A"}
						{duration ? ` · held ${duration}` : ""}
					</p>
				</div>

				{(trade.pnlUsd != null || trade.pnlPercent != null) && (
					<div className="flex shrink-0 flex-col items-end">
						<span className="text-[13px] text-text-muted">Profit / Loss</span>
						<span className={`text-[17px] font-bold tabular-nums ${pnlClass}`}>
							{trade.pnlUsd != null && `${trade.pnlUsd >= 0 ? "+" : ""}${formatUsd(trade.pnlUsd)}`}
							{trade.pnlPercent != null && (
								<span className="ml-1 text-[14px] font-medium">({formatPct(trade.pnlPercent)})</span>
							)}
						</span>
					</div>
				)}
			</div>
		</button>
	);
}
