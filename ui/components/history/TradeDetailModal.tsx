"use client";

import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import TradeLifecycleTimeline from "@/components/history/TradeLifecycleTimeline";
import CloseReasonBadge from "@/components/history/CloseReasonBadge";
import { formatDuration, formatPct, formatUsd } from "@/lib/format";
import type { TradeHistoryEntry } from "@/types/ui";

function DetailRow({ label, value, valueClassName = "" }: { label: string; value: string; valueClassName?: string }) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<span className="text-[14px] text-text-muted">{label}</span>
			<span className={`truncate text-[15px] font-semibold tabular-nums ${valueClassName}`}>{value}</span>
		</div>
	);
}

export default function TradeDetailModal({
	trade,
	accountValueUsd,
	onClose,
}: {
	trade: TradeHistoryEntry;
	accountValueUsd?: number;
	onClose: () => void;
}) {
	const openedMs = trade.openedAt ? Date.parse(trade.openedAt) : NaN;
	const closedMs = trade.closedAt ? Date.parse(trade.closedAt) : NaN;
	const durationMs = trade.status === "closed" ? closedMs - openedMs : Date.now() - openedMs;
	const duration = Number.isFinite(durationMs) ? formatDuration(durationMs) : undefined;

	const pnlClass =
		trade.pnlUsd == null || trade.pnlUsd === 0 ? "text-text-muted" : trade.pnlUsd > 0 ? "text-profit" : "text-loss";

	const allocationPct =
		trade.marginUsd != null && accountValueUsd != null && accountValueUsd > 0 ? (trade.marginUsd / accountValueUsd) * 100 : null;

	return (
		<Modal onClose={onClose} title="Trade Details">
			<div className="flex flex-col gap-5">
				<div className="flex flex-col items-center gap-2 py-2 text-center">
					<div className="flex items-center gap-2">
						<span className="text-[28px] font-bold tracking-tight">{trade.coin}</span>
						{trade.isBuy !== undefined && (
							<Badge tone={trade.isBuy ? "profit" : "loss"}>
								{trade.leverage != null ? `${trade.leverage}X ` : ""}
								{trade.isBuy ? "Long" : "Short"}
							</Badge>
						)}
					</div>
					{trade.pnlUsd != null && (
						<div className="flex items-baseline gap-1.5">
							<span className={`text-[36px] font-bold leading-none tracking-[-0.02em] tabular-nums ${pnlClass}`}>
								{trade.pnlUsd >= 0 ? "+" : ""}
								{formatUsd(trade.pnlUsd)}
							</span>
							{trade.pnlPercent != null && (
								<span className="text-[15px] font-semibold tabular-nums text-text-muted">({formatPct(trade.pnlPercent)})</span>
							)}
						</div>
					)}
					{trade.status === "closed" && trade.closeReason ? <CloseReasonBadge reason={trade.closeReason} /> : null}
				</div>

				<div className="divide-y divide-border rounded-xl bg-surface">
					<DetailRow label="Status" value={trade.status === "open" ? "Open" : "Closed"} />
					<DetailRow label="Trader" value={trade.trader ?? (trade.portfolioTitle ? "N/A" : "Unattributed")} />
					<DetailRow label="Portfolio" value={trade.portfolioTitle ?? (trade.trader ? "N/A" : "Unattributed")} />
					<DetailRow label="Entry Price" value={trade.entryPrice != null ? formatUsd(trade.entryPrice) : "N/A"} />
					{trade.status === "closed" && (
						<DetailRow label="Closing Price" value={trade.closingPrice != null ? formatUsd(trade.closingPrice) : "N/A"} />
					)}
					<DetailRow label="Leverage" value={trade.leverage != null ? `${trade.leverage}x` : "N/A"} />
					<DetailRow
						label="Notional"
						value={trade.notionalUsd != null ? formatUsd(trade.notionalUsd) : "N/A"}
						valueClassName={trade.notionalUsd != null ? "text-text-muted" : ""}
					/>
					<DetailRow
						label="Margin"
						value={
							trade.marginUsd != null
								? allocationPct != null
									? `${formatUsd(trade.marginUsd)} (${allocationPct.toFixed(2)}% of balance)`
									: formatUsd(trade.marginUsd)
								: "N/A"
						}
					/>
					<DetailRow label="Fees Paid" value={trade.feesUsd != null ? formatUsd(trade.feesUsd) : "N/A"} />
					<DetailRow label="Duration" value={duration ?? "N/A"} />
				</div>

				<div>
					<h4 className="mb-3 px-1 text-[15px] font-bold tracking-tight">Lifecycle</h4>
					<div className="rounded-xl bg-surface px-4 py-4">
						<TradeLifecycleTimeline lifecycle={trade.lifecycle} />
					</div>
				</div>

				<p className="px-1 text-[11px] text-text-muted/60">{trade.baseId}</p>
			</div>
		</Modal>
	);
}
