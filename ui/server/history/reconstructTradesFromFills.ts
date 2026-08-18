import type { HyperliquidFill } from "@daemon/types.js";

export interface FillTrade {
	coin: string;
	isBuy: boolean;
	openedAt?: string;
	closedAt: string;
	entryPrice?: number;
	closingPrice?: number;
	sizeOpened?: number;
	pnlUsd: number;
	feesUsd: number;
	/** True when any closing fill carried HL's own `liquidationMarkPx` - ground truth, not inferred from PnL/timing. */
	isLiquidated: boolean;
}

/**
 * Reconstructs real, fully-closed position lifecycles directly from HL's own
 * fill history - exchange ground truth, independent of anything this daemon
 * logged locally. This is the primary source of "what actually closed on
 * this wallet"; local logs/state are enrichment only (trader/leverage
 * attribution), never a gate on whether a real closed trade is shown at all.
 */
export function reconstructClosedTradesFromFills(fills: HyperliquidFill[]): FillTrade[] {
	const byCoin = new Map<string, HyperliquidFill[]>();
	for (const f of fills) {
		const list = byCoin.get(f.coin) ?? [];
		list.push(f);
		byCoin.set(f.coin, list);
	}

	const trades: FillTrade[] = [];

	for (const [coin, coinFills] of byCoin) {
		const sorted = [...coinFills].sort((a, b) => a.time - b.time);

		let openNotional = 0;
		let openSize = 0;
		let openedAtMs: number | undefined;
		let closeNotional = 0;
		let closedSize = 0;
		let pnlUsd = 0;
		let feesUsd = 0;
		let isBuy: boolean | undefined;
		let closedAtMs: number | undefined;
		let isLiquidated = false;

		const flush = () => {
			if (closedSize > 0 && closedAtMs !== undefined) {
				trades.push({
					coin,
					isBuy: isBuy ?? true,
					openedAt: openedAtMs ? new Date(openedAtMs).toISOString() : undefined,
					closedAt: new Date(closedAtMs).toISOString(),
					entryPrice: openSize > 0 ? openNotional / openSize : undefined,
					closingPrice: closedSize > 0 ? closeNotional / closedSize : undefined,
					sizeOpened: openSize > 0 ? openSize : undefined,
					pnlUsd,
					feesUsd,
					isLiquidated,
				});
			}
			openNotional = 0;
			openSize = 0;
			openedAtMs = undefined;
			closeNotional = 0;
			closedSize = 0;
			pnlUsd = 0;
			feesUsd = 0;
			isBuy = undefined;
			closedAtMs = undefined;
			isLiquidated = false;
		};

		for (const f of sorted) {
			const sz = parseFloat(f.sz);
			const px = parseFloat(f.px);
			if (!Number.isFinite(sz) || !Number.isFinite(px)) continue;

			feesUsd += parseFloat(f.fee || "0") || 0;

			if (f.dir === "Open Long" || f.dir === "Open Short") {
				if (openedAtMs === undefined) {
					openedAtMs = f.time;
					isBuy = f.dir === "Open Long";
				}
				openNotional += sz * px;
				openSize += sz;
			} else if (f.dir === "Close Long" || f.dir === "Close Short") {
				// Position may have existed before our fill window - still record
				// the close (ground truth PnL), just without a known entry/open size.
				if (isBuy === undefined) isBuy = f.dir === "Close Long";
				closedSize += sz;
				closeNotional += sz * px;
				pnlUsd += parseFloat(f.closedPnl || "0");
				closedAtMs = f.time;
				if (f.liquidationMarkPx != null) isLiquidated = true;
			} else {
				continue;
			}

			if (openSize > 0 && closedSize >= openSize - 1e-9) flush();
		}
		if (closedSize > 0 && openSize === 0) flush(); // trailing closes with no matched open in this fill window
	}

	return trades.sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt));
}
