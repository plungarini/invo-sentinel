import Badge from "@/components/shared/Badge";
import { formatUsd, formatPct } from "@/lib/format";
import { computeLiqFilledPct } from "@/lib/liquidation";
import type { WalletPosition } from "@/hooks/useWallet";

export default function PositionRow({
	position,
	accountValueUsd,
	onSelect,
}: {
	position: WalletPosition;
	accountValueUsd: number;
	onSelect: () => void;
}) {
	const size = parseFloat(position.szi);
	const isLong = size > 0;
	const entryPx = parseFloat(position.entryPx);
	const markPx = position.markPx !== null ? parseFloat(position.markPx) : null;
	const tracked = position.tracked;

	// HL computes these server-side for every open position regardless of whether
	// this daemon tracks it - the same numbers a real trading UI (Invo included)
	// shows, so "untracked" no longer means "no PnL shown".
	const pnlUsd = parseFloat(position.unrealizedPnl);
	const pnlPct = parseFloat(position.returnOnEquity) * 100;
	const hasPnl = Number.isFinite(pnlUsd) && Number.isFinite(pnlPct);
	const pnlClass = !hasPnl || pnlUsd === 0 ? "text-text-muted" : pnlUsd > 0 ? "text-profit" : "text-loss";
	const leverage = position.leverage?.value;

	// What you allocated at entry (notional ÷ leverage) - matches Invo's own margin
	// display; HL's live marginUsed instead drifts with unrealized P&L, see the detail modal.
	const initialMarginUsd = leverage && Number.isFinite(entryPx) ? (entryPx * Math.abs(size)) / leverage : null;
	const allocationPct = initialMarginUsd != null && accountValueUsd > 0 ? (initialMarginUsd / accountValueUsd) * 100 : null;

	const liqPx = position.liquidationPx != null ? parseFloat(position.liquidationPx) : null;
	const liqFilledPct = computeLiqFilledPct(entryPx, markPx, liqPx);
	// Dollar loss if the position reaches its liquidation price exactly - same signed-size
	// math as unrealizedPnl (see estimatePnlAt in the detail modal), just evaluated at liqPx.
	const liqLossUsd = liqPx != null && Number.isFinite(size) && Number.isFinite(entryPx) ? Math.abs(size * (liqPx - entryPx)) : null;
	// 3-bar severity gauge: exactly 0% stays fully unlit (no risk at all), then at least
	// 1 bar lights as soon as there's any real risk, escalating white -> amber -> red.
	const liqBarsLit =
		liqFilledPct == null || liqFilledPct === 0 ? 0 : liqFilledPct >= 66.67 ? 3 : liqFilledPct >= 33.34 ? 2 : 1;
	const liqBarColor = liqBarsLit === 3 ? "bg-loss" : liqBarsLit === 2 ? "bg-badge-amber" : "bg-text";
	// A confirmed 0% (not just "no data") reads as a dim teal "all clear" rather than plain grey.
	const liqBarUnlitColor = liqFilledPct === 0 ? "bg-profit/25" : "bg-text-faint";

	return (
		<button
			type="button"
			onClick={onSelect}
			className="w-full cursor-pointer rounded-xl bg-surface px-4 py-3.5 text-left transition-colors duration-150 hover:bg-surface-hover"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-[17px] font-bold tracking-tight">{position.coin}</span>
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
					<p className="mt-1 text-[15px] font-medium tabular-nums text-text-muted">
						{Number.isFinite(entryPx) ? formatUsd(entryPx) : "N/A"}
						{markPx !== null && <span className="text-text-muted/60"> → {formatUsd(markPx)}</span>}
					</p>
				</div>
				<div className="flex shrink-0 flex-col items-end">
					<span className="text-[13px] text-text-muted">Profit / Loss</span>
					<span className="flex items-baseline gap-1">
						<span className={`text-[17px] font-bold tabular-nums ${pnlClass}`}>
							{hasPnl ? `${pnlUsd >= 0 ? "+" : ""}${formatUsd(pnlUsd)}` : "N/A"}
						</span>
						{hasPnl && <span className="text-[14px] font-medium tabular-nums text-text-muted">({formatPct(pnlPct)})</span>}
					</span>
				</div>
			</div>

			<div className="mt-3 grid grid-cols-2 items-center gap-x-3 gap-y-2.5 border-t border-border pt-3">
				<div className="min-w-0">
					<p className="text-[12px] text-text-muted">Allocation</p>
					<p className="truncate text-[14px] font-semibold tabular-nums">
						{allocationPct != null ? `${formatUsd(initialMarginUsd!)} (${allocationPct.toFixed(2)}%)` : "N/A"}
					</p>
				</div>
				<div className="min-w-0 text-right">
					<p className="text-[12px] text-text-muted">Liq. Risk</p>
					<div className="flex items-center justify-end gap-1.5">
						<div className="flex items-center gap-0.5">
							{[0, 1, 2].map((i) => (
								<div key={i} className={`h-3.5 w-1 rounded-full ${i < liqBarsLit ? liqBarColor : liqBarUnlitColor}`} />
							))}
						</div>
						<span className="text-[14px] font-semibold tabular-nums">
							{liqFilledPct != null ? `${liqFilledPct.toFixed(2)}%` : "N/A"}
						</span>
					</div>
				</div>
				<div className="min-w-0">
					<p className="text-[12px] text-text-muted">Liq. Price</p>
					<p className="truncate text-[14px] font-semibold tabular-nums">{liqPx != null ? formatUsd(liqPx) : "N/A"}</p>
				</div>
				<div className="min-w-0 text-right">
					<p className="text-[12px] text-text-muted">Liq. Loss</p>
					<p className="truncate text-[14px] font-semibold tabular-nums text-loss">
						{liqLossUsd != null ? `-${formatUsd(liqLossUsd)}` : "N/A"}
					</p>
				</div>
			</div>
		</button>
	);
}
