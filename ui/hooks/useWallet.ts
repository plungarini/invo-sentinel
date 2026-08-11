import { useEffect, useState } from "react";
import type { HyperliquidPosition, PositionState } from "@daemon/types.js";

export interface WalletPosition extends HyperliquidPosition {
	markPx: string | null;
	/** Decimal hourly rate (e.g. 0.0000125 = 0.00125%/hr), null if HL didn't return one for this coin. */
	fundingRateHourly: number | null;
	tracked: (PositionState & { baseId: string; priceTarget: number | null; stopLoss: number | null }) | null;
	/** Not managed by this daemon, but uniquely matched to a followed trader's own open investment by coin+direction - trader/TP/SL sourced live from Invo, not local state. */
	invoMatch: { portfolioTitle: string; ownerUsername?: string; priceTarget: number | null; stopLoss: number | null } | null;
}

export interface WalletResponse {
	accountValueUsd: number;
	positions: WalletPosition[];
}

/**
 * Pushed over SSE (`/api/wallet/stream`) - the server keeps ONE shared poll
 * loop per process (walletBroadcaster.ts) and fans it out to every connected
 * tab, instead of each tab polling HL independently. `fallbackData` (from the
 * page's own SSR fetch) covers the gap before the stream's first message arrives.
 */
export function useWallet(fallbackData?: WalletResponse) {
	const [data, setData] = useState<WalletResponse | undefined>(fallbackData);
	const [error, setError] = useState<Error | undefined>(undefined);

	useEffect(() => {
		const es = new EventSource("/api/wallet/stream");

		es.onmessage = (event) => {
			try {
				setData(JSON.parse(event.data) as WalletResponse);
				setError(undefined);
			} catch {
				// malformed message - wait for the next push rather than surfacing a transient parse hiccup
			}
		};

		// EventSource auto-reconnects on a dropped connection on its own; only a
		// fully closed source (e.g. the server rejected the request) is unrecoverable.
		es.onerror = () => {
			if (es.readyState === EventSource.CLOSED) setError(new Error("Wallet stream disconnected"));
		};

		return () => es.close();
	}, []);

	return { data, error };
}
