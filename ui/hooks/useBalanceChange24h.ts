import useSWR from "swr";
import { fetcher } from "@/lib/polling";
import type { BalanceChange24h } from "@/server/hyperliquid/loadBalanceChange24h";

const BALANCE_CHANGE_REFRESH_MS = 5 * 60_000;

export function useBalanceChange24h() {
	return useSWR<BalanceChange24h | null>("/api/balance-change", fetcher, {
		refreshInterval: BALANCE_CHANGE_REFRESH_MS,
	});
}
