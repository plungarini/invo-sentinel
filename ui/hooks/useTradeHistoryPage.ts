import useSWRInfinite from "swr/infinite";
import type { TradeHistoryEntry } from "@/types/ui";
import { fetcher } from "@/lib/polling";

const PAGE_SIZE = 20;

interface HistoryPage {
	trades: TradeHistoryEntry[];
	nextCursor: number | null;
	total: number;
}

/**
 * Real network-level pagination for the Wallet History tab - each page is its
 * own request against /api/history?limit=&cursor=, not a client-side slice of
 * an already-fully-fetched list. loadHistory() still computes the whole trade
 * list server-side once (cached via staleWhileRevalidate), but only the
 * requested page's trades cross the wire per request.
 */
export function useTradeHistoryPage(enabled: boolean) {
	const { data, error, size, setSize, isValidating } = useSWRInfinite<HistoryPage>(
		(pageIndex, previousPage: HistoryPage | null) => {
			if (!enabled) return null;
			if (previousPage && previousPage.nextCursor === null) return null; // reached the end
			const cursor = pageIndex === 0 ? 0 : previousPage?.nextCursor ?? 0;
			return `/api/history?limit=${PAGE_SIZE}&cursor=${cursor}`;
		},
		fetcher,
	);

	const trades = data?.flatMap((p) => p.trades) ?? [];
	const lastPage = data?.[data.length - 1];
	const hasMore = lastPage ? lastPage.nextCursor !== null : false;

	return {
		trades,
		total: lastPage?.total,
		hasMore,
		loadMore: () => setSize(size + 1),
		// True only before the first page has ever resolved - a real empty-state skeleton.
		isLoading: enabled && !data && !error,
		// True while an additional page is in flight after the first has already loaded.
		isLoadingMore: enabled && isValidating && !!data && size > data.length,
		error,
	};
}
