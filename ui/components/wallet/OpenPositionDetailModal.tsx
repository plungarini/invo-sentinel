"use client";

import Modal from "@/components/shared/Modal";
import Badge from "@/components/shared/Badge";
import { formatPct, formatUsd } from "@/lib/format";
import { computeLiqFilledPct } from "@/lib/liquidation";
import type { WalletPosition } from "@/hooks/useWallet";

function DetailRow({ label, value, valueClassName = "", title }: { label: string; value: string; valueClassName?: string; title?: string }) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<span className="text-[14px] text-text-muted" title={title}>
				{label}
			</span>
			<span className={`truncate text-[15px] font-semibold tabular-nums ${valueClassName}`}>{value}</span>
		</div>
	);
}

/** Take-Profit/Stop-Loss row - price plus the PnL you'd land at if it filled exactly there, same as Invo's own display. */
function TargetPriceRow({
	label,
	price,
	estimatedPnlUsd,
	title,
}: {
	label: string;
	price: number | null | undefined;
	estimatedPnlUsd: number | null;
	title?: string;
}) {
	const pnlClass = estimatedPnlUsd == null || estimatedPnlUsd === 0 ? "text-text-muted" : estimatedPnlUsd > 0 ? "text-profit" : "text-loss";
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<span className="text-[14px] text-text-muted" title={title}>
				{label}
			</span>
			<span className="flex items-baseline gap-1.5 truncate text-[15px] font-semibold tabular-nums">
				{price != null ? formatUsd(price) : "-"}
				{price != null && estimatedPnlUsd != null && (
					<span className={`text-[13px] font-medium tabular-nums ${pnlClass}`}>
						({estimatedPnlUsd >= 0 ? "+" : ""}
						{formatUsd(estimatedPnlUsd)})
					</span>
				)}
			</span>
		</div>
	);
}

export default function OpenPositionDetailModal({
	position,
	accountValueUsd,
	onClose,
}: {
	position: WalletPosition;
	accountValueUsd: number;
	onClose: () => void;
}) {
	const size = parseFloat(position.szi);
	const isLong = size > 0;
	const entryPx = parseFloat(position.entryPx);
	const markPx = position.markPx !== null ? parseFloat(position.markPx) : null;
	const notionalUsd = parseFloat(position.positionValue);
	const liqPx = position.liquidationPx != null ? parseFloat(position.liquidationPx) : null;
	const leverage = position.leverage?.value;

	// The margin you actually allocated at entry (notional at entry / leverage) - fixed,
	// and what Invo's own "Position Allocation" shows. HL's live `marginUsed` instead
	// tracks remaining isolated collateral, which drifts down as unrealized P&L eats
	// into it, so the two numbers are expected to diverge as a losing trade ages.
	const marginUsedUsd = parseFloat(position.marginUsed);
	const initialMarginUsd = leverage && Number.isFinite(entryPx) ? (entryPx * Math.abs(size)) / leverage : null;
	const allocationPct = initialMarginUsd != null && accountValueUsd > 0 ? (initialMarginUsd / accountValueUsd) * 100 : null;

	const pnlUsd = parseFloat(position.unrealizedPnl);
	const pnlPct = parseFloat(position.returnOnEquity) * 100;
	const hasPnl = Number.isFinite(pnlUsd) && Number.isFinite(pnlPct);
	const pnlClass = !hasPnl || pnlUsd === 0 ? "text-text-muted" : pnlUsd > 0 ? "text-profit" : "text-loss";

	const fundingSinceOpen = parseFloat(position.cumFunding?.sinceOpen ?? "");
	const hasFunding = Number.isFinite(fundingSinceOpen);

	const tracked = position.tracked;
	const invoMatch = position.invoMatch;
	const ownerUsername = tracked?.ownerUsername ?? invoMatch?.ownerUsername;
	const priceTarget = tracked?.priceTarget ?? invoMatch?.priceTarget;
	const stopLoss = tracked?.stopLoss ?? invoMatch?.stopLoss;

	// What you'd land at if the position closed exactly at that price - same math as
	// unrealizedPnl (signed size handles long/short: negative size flips the sign for a short).
	const estimatePnlAt = (targetPx: number | null | undefined): number | null =>
		targetPx != null && Number.isFinite(size) && Number.isFinite(entryPx) ? size * (targetPx - entryPx) : null;
	const takeProfitPnlUsd = estimatePnlAt(priceTarget);
	const stopLossPnlUsd = estimatePnlAt(stopLoss);

	const liqFilledPct = computeLiqFilledPct(entryPx, markPx, liqPx);

	return (
		<Modal onClose={onClose} title="Position Details">
			<div className="flex flex-col gap-5">
				<div className="flex flex-col items-center gap-2 py-2 text-center">
					<div className="flex items-center gap-2">
						<span className="text-[28px] font-bold tracking-tight">{position.coin}</span>
					</div>
					<div className="flex items-center gap-2">
						<Badge tone={isLong ? "profit" : "loss"}>
							{leverage != null ? `${leverage}X ` : ""}
							{isLong ? "Long" : "Short"}
						</Badge>
						{!tracked && (
							<Badge tone="amber" title="Not managed by this daemon">
								Untracked
							</Badge>
						)}
					</div>
					{hasPnl && (
						<div className="flex items-baseline gap-1.5">
							<span className={`text-[36px] font-bold leading-none tracking-[-0.02em] tabular-nums ${pnlClass}`}>
								{pnlUsd >= 0 ? "+" : ""}
								{formatUsd(pnlUsd)}
							</span>
							<span className="text-[15px] font-semibold tabular-nums text-text-muted">({formatPct(pnlPct)})</span>
						</div>
					)}
				</div>

				<div className="divide-y divide-border rounded-xl bg-surface">
					{ownerUsername && <DetailRow label="Trader" value={ownerUsername} />}
					<DetailRow label="Entry Price" value={formatUsd(entryPx)} />
					<TargetPriceRow
						label="Take-Profit"
						price={priceTarget}
						estimatedPnlUsd={takeProfitPnlUsd}
						title="No exchange order is placed for this - reference only. The bracketed amount is the estimated PnL if it filled exactly here."
					/>
					<TargetPriceRow
						label="Stop-Loss"
						price={stopLoss}
						estimatedPnlUsd={stopLossPnlUsd}
						title="No exchange order is placed for this - reference only. The bracketed amount is the estimated PnL if it filled exactly here."
					/>
					<DetailRow label="Mark Price" value={markPx != null ? formatUsd(markPx) : "N/A"} />
					<DetailRow label="Notional" value={Number.isFinite(notionalUsd) ? formatUsd(notionalUsd) : "N/A"} />
					<DetailRow
						label="Margin"
						value={
							initialMarginUsd != null
								? `${formatUsd(initialMarginUsd)} (${allocationPct!.toFixed(2)}% of balance)`
								: "N/A"
						}
						title={
							Number.isFinite(marginUsedUsd)
								? `What you allocated at entry (notional / leverage), as a percent of your current account balance. Hyperliquid's live remaining collateral is currently ${formatUsd(marginUsedUsd)}, drifting from this as unrealized P&L is applied.`
								: "What you allocated at entry (notional / leverage), as a percent of your current account balance."
						}
					/>
					<DetailRow
						label="Funding Paid (since open)"
						value={hasFunding ? `${fundingSinceOpen >= 0 ? "+" : ""}${formatUsd(fundingSinceOpen)}` : "N/A"}
						valueClassName={!hasFunding ? "" : fundingSinceOpen >= 0 ? "text-profit" : "text-loss"}
						title="Perpetuals periodically shift a small payment between long and short holders to track spot price. Positive means you received it; negative means you paid it."
					/>
					<div className="px-4 py-3">
						<div className="mb-2 flex items-center justify-between gap-4">
							<span className="text-[14px] text-text-muted">Liq. Price</span>
							<span className="text-[15px] font-semibold tabular-nums">{liqPx != null ? formatUsd(liqPx) : "N/A"}</span>
						</div>
						{liqFilledPct != null && (
							<>
								<div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
									<div className="h-full rounded-full bg-loss" style={{ width: `${liqFilledPct}%` }} />
								</div>
								<p className="mt-1.5 text-center text-[12px] text-text-muted">{liqFilledPct.toFixed(2)}% of the way to liquidation</p>
							</>
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
}
