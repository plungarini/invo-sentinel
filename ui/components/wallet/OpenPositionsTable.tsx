"use client";

import { useState } from "react";
import PositionRow from "@/components/wallet/PositionRow";
import OpenPositionDetailModal from "@/components/wallet/OpenPositionDetailModal";
import type { PositionSortKey, PositionSortState } from "@/hooks/usePositionSort";
import { computeLiqFilledPct } from "@/lib/liquidation";
import type { WalletPosition } from "@/hooks/useWallet";

/** Rounds to the same precision the row actually displays, so two positions reading identically (e.g. both "0.00%") tie exactly instead of silently reordering every poll tick over a sub-cent/sub-basis-point difference nobody can see. */
function round(value: number, decimals: number): number {
	const factor = 10 ** decimals;
	return Math.round(value * factor) / factor;
}

/** Null for anything unranked (missing/non-numeric) so it sorts last regardless of direction, rather than tying with a real 0. */
function sortValue(position: WalletPosition, key: PositionSortKey): number | null {
	if (key === "pnl") {
		const pnl = parseFloat(position.unrealizedPnl);
		return Number.isFinite(pnl) ? round(pnl, 2) : null;
	}
	if (key === "updatedAt") {
		// `lastFillTimeMs` (HL's own fill history) works for any position, tracked or not;
		// `tracked.openedAt` is only a fallback for the rare case fills history somehow
		// has nothing for this coin. A fixed historical timestamp never needs rounding -
		// it doesn't fluctuate tick to tick the way a live price-derived value does.
		const ts = position.lastFillTimeMs ?? (position.tracked?.openedAt ? Date.parse(position.tracked.openedAt) : NaN);
		return Number.isFinite(ts) ? ts : null;
	}
	const entryPx = parseFloat(position.entryPx);
	if (key === "allocation") {
		// Same "what you allocated at entry" math as the row itself (notional at entry ÷ leverage) -
		// sorting by the dollar amount gives the identical order to sorting by its %-of-balance display,
		// since every position in this list divides by the same current account balance.
		const size = parseFloat(position.szi);
		const leverage = position.leverage?.value;
		const marginUsd = leverage && Number.isFinite(entryPx) ? (entryPx * Math.abs(size)) / leverage : NaN;
		return Number.isFinite(marginUsd) ? round(marginUsd, 2) : null;
	}
	const markPx = position.markPx != null ? parseFloat(position.markPx) : null;
	const liqPx = position.liquidationPx != null ? parseFloat(position.liquidationPx) : null;
	const liqFilledPct = computeLiqFilledPct(entryPx, markPx, liqPx);
	return liqFilledPct != null ? round(liqFilledPct, 2) : null;
}

export default function OpenPositionsTable({
	positions,
	accountValueUsd,
	sort,
}: {
	positions: WalletPosition[];
	accountValueUsd: number;
	sort: PositionSortState;
}) {
	const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
	const selected = selectedCoin ? positions.find((p) => p.coin === selectedCoin) : undefined;

	if (positions.length === 0) {
		return <p className="px-1 py-8 text-center text-[14px] text-text-muted">No open positions.</p>;
	}

	// No sort chosen defaults to best-PnL-first, same as before this control existed.
	const activeKey = sort.key ?? "pnl";
	const direction = sort.key ? sort.direction : "desc";
	const sorted = [...positions].sort((a, b) => {
		if (activeKey === "symbol") {
			const cmp = a.coin.localeCompare(b.coin);
			return direction === "desc" ? -cmp : cmp;
		}
		const va = sortValue(a, activeKey);
		const vb = sortValue(b, activeKey);
		if (va == null && vb == null) return 0;
		if (va == null) return 1;
		if (vb == null) return -1;
		return direction === "desc" ? vb - va : va - vb;
	});

	return (
		<div className="flex flex-col gap-2.5">
			{sorted.map((position) => (
				<PositionRow
					key={position.coin}
					position={position}
					accountValueUsd={accountValueUsd}
					onSelect={() => setSelectedCoin(position.coin)}
				/>
			))}
			{selected && <OpenPositionDetailModal position={selected} accountValueUsd={accountValueUsd} onClose={() => setSelectedCoin(null)} />}
		</div>
	);
}
