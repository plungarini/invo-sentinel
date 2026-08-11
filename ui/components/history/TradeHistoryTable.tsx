import type { TradeHistoryEntry } from "@/types/ui";
import TradeRow from "./TradeRow";

export default function TradeHistoryTable({
	trades,
	onSelectTrade,
}: {
	trades: TradeHistoryEntry[];
	onSelectTrade: (baseId: string) => void;
}) {
	if (trades.length === 0) {
		return <p className="px-1 py-8 text-center text-[14px] text-text-muted">No trade history yet.</p>;
	}

	return (
		<div className="flex flex-col gap-2.5">
			{trades.map((trade) => (
				<TradeRow key={trade.baseId} trade={trade} onSelect={onSelectTrade} />
			))}
		</div>
	);
}
