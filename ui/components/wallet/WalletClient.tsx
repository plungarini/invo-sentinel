"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Tabs from "@/components/shared/Tabs";
import Button from "@/components/shared/Button";
import TotalBalanceCard from "@/components/shared/TotalBalanceCard";
import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import OpenPositionsTable from "@/components/wallet/OpenPositionsTable";
import PositionSortChip from "@/components/wallet/PositionSortChip";
import { usePositionSort } from "@/hooks/usePositionSort";
import TransfersList from "@/components/wallet/TransfersList";
import RowSkeleton from "@/components/wallet/RowSkeleton";
import TradeHistoryTable from "@/components/history/TradeHistoryTable";
import TradeDetailModal from "@/components/history/TradeDetailModal";
import { useWallet, type WalletResponse } from "@/hooks/useWallet";
import { useTransfers } from "@/hooks/useTransfers";
import { useTradeHistoryPage } from "@/hooks/useTradeHistoryPage";
import { useFeesTotal } from "@/hooks/useFeesTotal";
import { useTradeByBaseId } from "@/hooks/useTradeByBaseId";

const TABS = ["Open", "History", "Transfers"] as const;

export default function WalletClient({
	initialData,
	initialFees,
}: {
	initialData?: WalletResponse;
	initialFees?: { totalFeesUsd: number };
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	// A deep link (?trade=) always points at a history entry, so treat History as
	// already "visited" on first render - otherwise the fetch that would resolve
	// it never fires and the modal can never open.
	const hasTradeDeepLink = searchParams.get("trade") != null;
	const [tab, setTab] = useState<(typeof TABS)[number]>(hasTradeDeepLink ? "History" : "Open");
	const [visitedTabs, setVisitedTabs] = useState<Set<(typeof TABS)[number]>>(
		new Set(hasTradeDeepLink ? ["Open", "History"] : ["Open"]),
	);

	const changeTab = (t: (typeof TABS)[number]) => {
		setTab(t);
		if (!visitedTabs.has(t)) setVisitedTabs(new Set(visitedTabs).add(t));
	};

	const [sort, setSort] = usePositionSort();
	const { data, error } = useWallet(initialData);
	// Transfers and history are only fetched once their tab has actually been opened,
	// and history itself streams in page by page rather than all at once.
	const { data: transfersData, error: transfersError } = useTransfers(undefined, visitedTabs.has("Transfers"));
	const {
		trades: historyTrades,
		hasMore: hasMoreHistory,
		loadMore: loadMoreHistory,
		isLoading: historyLoading,
		isLoadingMore: historyLoadingMore,
		error: historyError,
	} = useTradeHistoryPage(visitedTabs.has("History"));
	// Same SWR key/hook Overview uses for its Fees stat - shares one cached,
	// SSR-seeded value across both pages, and deliberately not useAnalytics
	// (which also triggers a live HL positions fetch this banner doesn't need).
	const { data: feesData } = useFeesTotal(initialFees);

	const selectedBaseId = searchParams.get("trade");
	const selectedTradeFromPage = selectedBaseId ? historyTrades.find((t) => t.baseId === selectedBaseId) : undefined;
	// Falls back to a direct lookup only when the deep-linked trade isn't in an
	// already-fetched page (e.g. it's further back than the History tab has paginated to).
	const { data: fallbackTradeData } = useTradeByBaseId(!selectedTradeFromPage ? selectedBaseId : null);
	const selectedTrade = selectedTradeFromPage ?? fallbackTradeData?.trade ?? undefined;

	const openTrade = (baseId: string) => router.push(`/wallet?trade=${encodeURIComponent(baseId)}`, { scroll: false });
	const closeTrade = () => router.push("/wallet", { scroll: false });

	// The page shell (banner, tabs) and per-tab skeletons render on every pass,
	// `data` present or not - only the pieces that actually depend on it swap
	// in once it arrives, instead of blocking the whole page behind one gate.
	// With SSR `fallbackData`, `data` is usually there from the first render;
	// this only matters for the gap on a genuine cold start or a stream error.
	return (
		<div className="flex h-full min-h-0 flex-col pt-14 md:pt-0">
			<div className="shrink-0">
				{data ? (
					<TotalBalanceCard
						accountValueUsd={data.accountValueUsd}
						availableUsd={data.accountValueUsd - data.positions.reduce((sum, p) => sum + parseFloat(p.marginUsed), 0)}
						feesUsd={feesData?.totalFeesUsd}
					/>
				) : (
					<Card>
						<div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
							<div className="w-full flex-1">
								<Skeleton className="h-4 w-28" />
								<Skeleton className="mt-2 h-11 w-48" />
							</div>
						</div>
					</Card>
				)}
				<div className="flex items-center justify-between pb-4 pt-3">
					<Tabs tabs={TABS} active={tab} onChange={changeTab} />
					{tab === "Open" && <PositionSortChip sort={sort} onChange={setSort} />}
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-1.5 -mr-1.5 md:pb-6">
				{!data ? (
					error ? (
						<p className="px-1 text-[15px] text-text-muted">Failed to load wallet data.</p>
					) : (
						<RowSkeleton />
					)
				) : tab === "Open" ? (
					<OpenPositionsTable positions={data.positions} accountValueUsd={data.accountValueUsd} sort={sort} />
				) : tab === "History" ? (
					historyLoading ? (
						<RowSkeleton />
					) : historyTrades.length === 0 && historyError ? (
						<p className="px-1 text-[15px] text-text-muted">Failed to load trade history.</p>
					) : (
						<div className="flex flex-col gap-3">
							<TradeHistoryTable trades={historyTrades} onSelectTrade={openTrade} />
							{historyLoadingMore && <RowSkeleton count={2} />}
							{!historyLoadingMore && hasMoreHistory && (
								<Button variant="secondary" className="w-full" onClick={loadMoreHistory}>
									Load more
								</Button>
							)}
						</div>
					)
				) : transfersData ? (
					<TransfersList transfers={transfersData.transfers} />
				) : transfersError ? (
					<p className="px-1 text-[15px] text-text-muted">Failed to load transfers.</p>
				) : (
					<RowSkeleton />
				)}
			</div>

			{selectedTrade && data ? (
				<TradeDetailModal trade={selectedTrade} accountValueUsd={data.accountValueUsd} onClose={closeTrade} />
			) : null}
		</div>
	);
}
