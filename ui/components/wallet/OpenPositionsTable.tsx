"use client";

import { useState } from "react";
import PositionRow from "@/components/wallet/PositionRow";
import OpenPositionDetailModal from "@/components/wallet/OpenPositionDetailModal";
import type { WalletPosition } from "@/hooks/useWallet";

export default function OpenPositionsTable({ positions, accountValueUsd }: { positions: WalletPosition[]; accountValueUsd: number }) {
	const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
	const selected = selectedCoin ? positions.find((p) => p.coin === selectedCoin) : undefined;

	if (positions.length === 0) {
		return <p className="px-1 py-8 text-center text-[14px] text-text-muted">No open positions.</p>;
	}

	return (
		<div className="flex flex-col gap-2.5">
			{positions.map((position) => (
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
