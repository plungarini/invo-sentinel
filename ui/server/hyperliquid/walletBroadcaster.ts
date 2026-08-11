import "server-only";
import { fetchWallet } from "./loadWallet";
import type { WalletResponse } from "@/hooks/useWallet";

// No reliable single push feed exists for the full positions+account-value
// state (see hyperliquid-client.ts's connect() comment - webData2 is
// currently rejected by HL's WS server), so this is still REST underneath.
// The win is that N browser tabs share ONE poll loop and get pushed updates
// over SSE, instead of each tab hitting HL independently every few seconds.
const POLL_INTERVAL_MS = 2_000;

type Listener = (data: WalletResponse) => void;

let latest: WalletResponse | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

async function tick(): Promise<void> {
	try {
		latest = await fetchWallet();
		for (const listener of listeners) listener(latest);
	} catch (e) {
		console.error("[walletBroadcaster] refresh failed", e);
	}
}

/** Subscribes to live wallet updates, starting the shared poll loop if this is the first listener. Fires immediately with the latest known snapshot if one exists. Returns an unsubscribe function that stops the loop once nobody's listening. */
export function subscribeWallet(listener: Listener): () => void {
	if (!timer) {
		timer = setInterval(tick, POLL_INTERVAL_MS);
		tick();
	}
	if (latest) listener(latest);
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
		if (listeners.size === 0 && timer) {
			clearInterval(timer);
			timer = null;
		}
	};
}
