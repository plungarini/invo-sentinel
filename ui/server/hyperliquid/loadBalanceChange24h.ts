import "server-only";
import { getHyperliquidClient } from "./client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";

const CACHE_TTL_MS = 5 * 60_000; // the 24h baseline barely moves minute to minute - no need to poll HL tightly for this

export interface BalanceChange24h {
	changeUsd: number;
	changePercent: number;
}

async function fetchBalanceChange24h(): Promise<BalanceChange24h | null> {
	const hl = await getHyperliquidClient();
	const [current, history, ledgerUpdates] = await Promise.all([hl.getAccountValueUsd(), hl.getDailyAccountValueHistory(), hl.getLedgerUpdates()]);
	if (history.length === 0) return null;

	const { time: baselineTime, accountValueUsd: past } = history[0];
	if (past === 0) return null; // avoid a divide-by-zero on a brand-new account

	// Bounded to the baseline window instead of `getUserFills()`'s full account
	// history - this call only ever needs fills at/after baselineTime anyway.
	const fills = await hl.getUserFillsSince(baselineTime);

	// A raw equity delta counts deposits/withdrawals in the window as if they
	// were trading PnL - net them out so this reads as actual PnL, not Δequity.
	const netTransfersUsd = ledgerUpdates
		.filter((u) => u.time >= baselineTime)
		.reduce((sum, u) => {
			const raw = u.delta.usdcValue ?? u.delta.amount ?? u.delta.usdc;
			return typeof raw === "string" ? sum + parseFloat(raw) : sum;
		}, 0);

	// Fees already reduced equity when each fill executed - add them back so
	// this reads as pure trading PnL, not PnL-net-of-fees. `fee` is negative
	// for rebates, so a rebate correctly reduces the add-back too.
	const feesUsd = fills
		.filter((f) => f.time >= baselineTime)
		.reduce((sum, f) => (f.fee != null ? sum + parseFloat(f.fee) : sum), 0);

	const changeUsd = current - past - netTransfersUsd + feesUsd;
	return { changeUsd, changePercent: (changeUsd / past) * 100 };
}

/** Shared by /api/balance-change and any future SSR consumer. */
export const loadBalanceChange24h = staleWhileRevalidate(fetchBalanceChange24h, CACHE_TTL_MS);
