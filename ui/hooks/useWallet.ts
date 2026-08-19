import { useEffect, useState } from "react";
import type { HyperliquidPosition, PositionState } from "@daemon/types.js";

export interface WalletPosition extends HyperliquidPosition {
	markPx: string | null;
	/** Decimal hourly rate (e.g. 0.0000125 = 0.00125%/hr), null if HL didn't return one for this coin. */
	fundingRateHourly: number | null;
	/** Epoch ms of the most recent real fill on this coin, straight from HL's own fill history - works even when `tracked` is null. */
	lastFillTimeMs: number | null;
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
 *
 * Connection is torn down while the browser tab is hidden and reopened on
 * return - `subscribeWallet`'s listener count drives whether the server's
 * poll loop runs at all (see walletBroadcaster.ts), so a backgrounded tab
 * genuinely stops contributing to Invo/HL request volume instead of just
 * not rendering the pushes it keeps receiving.
 */
export function useWallet(fallbackData?: WalletResponse) {
	const [data, setData] = useState<WalletResponse | undefined>(fallbackData);
	const [error, setError] = useState<Error | undefined>(undefined);

	useEffect(() => {
		let es: EventSource | null = null;

		function connect() {
			es = new EventSource("/api/wallet/stream");

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
				if (es?.readyState === EventSource.CLOSED) setError(new Error("Wallet stream disconnected"));
			};
		}

		function handleVisibilityChange() {
			if (document.hidden) {
				es?.close();
				es = null;
			} else if (!es) {
				connect();
			}
		}

		if (!document.hidden) connect();
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			es?.close();
		};
	}, []);

	return { data, error };
}
