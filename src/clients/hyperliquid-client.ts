import { Hyperliquid } from 'hyperliquid';
import { SlowCallTracker } from '../services/call-timing.js';
import '../services/http-dispatcher.js';
import type { HyperliquidFill, HyperliquidLedgerUpdate, HyperliquidPosition } from '../types.js';

const slowCalls = new SlowCallTracker('hyperliquid');

// Required on every order for Invo compatibility.
const INVO_BUILDER = { address: '0x557edb253b1d7ed5f15b248a5a3fd919fa5d3c81', fee: 35 };

// The SDK's SymbolConversion layer expects "SOL-PERP"; the raw /info REST
// endpoints (meta, allMids, clearinghouseState) use bare "SOL".
function toSdkCoin(coin: string): string {
	return coin.includes('-') ? coin : `${coin}-PERP`;
}

const HL_INFO_TIMEOUT_MS = 15_000;
const HL_EXCHANGE_TIMEOUT_MS = 20_000;

/**
 * The SDK's own exchange calls (`connect`/`updateLeverage`/`placeOrder`) go
 * through axios internally - entirely separate from our own fetch/undici
 * setup, so http-dispatcher.ts's fix does not cover this path at all. This
 * is a Promise.race, not a true cancel: the underlying axios request keeps
 * running in the background even after we stop waiting on it. Harmless for
 * `updateLeverage` (idempotent, no order placed); for `placeOrder` there's
 * a small residual risk the order actually succeeds server-side after
 * we've already given up and moved on to logging it as failed - but that
 * bounded, rare risk is strictly better than an indefinite hang of the
 * entire daemon, which is what happens with no timeout at all (observed
 * live: a multi-minute freeze with zero pending requests visible from our
 * side once axios's own state got stuck).
 */
function withRaceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
	]);
}

/**
 * Every /info call goes through here specifically so none of them can hang
 * forever: a dead/stalled connection with no timeout blocks the entire
 * reconcile cycle indefinitely with nothing ever thrown, so the daemon
 * looks "silently frozen" rather than erroring - no log line, no crash,
 * just no forward progress until something external (a restart) breaks
 * the stall. A bounded timeout turns that into an ordinary catchable
 * error instead, retried on the very next cycle.
 *
 * Uses a manual AbortController rather than the `AbortSignal.timeout()`
 * shorthand deliberately: undici (Node's fetch implementation) can reuse a
 * keep-alive socket the remote already closed and hang waiting on it from
 * deep inside its own connection-pool state machine, a path
 * `AbortSignal.timeout()` doesn't reliably reach (see http-dispatcher.ts,
 * imported for its side effect of shortening keep-alive so this scenario
 * is rare in the first place). The manual pattern at least gives a real,
 * inspectable timer instead of an opaque one.
 */
async function postInfo(body: unknown): Promise<any> {
	const label = `/info:${(body as { type?: string })?.type ?? 'unknown'}`;
	return slowCalls.track(label, async () => {
		const controller = new AbortController();
		const timer = setTimeout(
			() => controller.abort(new Error(`HL /info timed out after ${HL_INFO_TIMEOUT_MS}ms`)),
			HL_INFO_TIMEOUT_MS,
		);
		try {
			const resp = await fetch('https://api.hyperliquid.xyz/info', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			return await resp.json();
		} finally {
			clearTimeout(timer);
		}
	});
}

// HL rejects a perp limit price that violates EITHER of two independent
// caps: 5 significant figures, AND at most (6 - szDecimals) decimal places.
// For a major like BTC the second cap never bites (price is large, few
// decimals needed); for a cheap coin like XAI/SAGA (sub-cent price) 5 sig
// figs alone lands well past the decimal-place cap and HL returns "Order
// has invalid price" - silently, inside a 200 OK, not a thrown error.
function roundToValidLimitPx(rawPx: number, szDecimals: number): number {
	const sigFigRounded = parseFloat(rawPx.toPrecision(5));
	const maxDecimals = Math.max(0, 6 - szDecimals);
	return parseFloat(sigFigRounded.toFixed(maxDecimals));
}

/**
 * HL's placeOrder responds 200 OK even when the exchange rejected the
 * order outright (e.g. bad price/size); the actual outcome is buried in
 * response.data.statuses[]. Callers must check this before treating an
 * order as real - recording tracked state or an Invo mimic off an order
 * that never actually filled silently corrupts both.
 */
export function orderFillError(result: any): string | null {
	if (result?.status !== 'ok') return result?.response ?? 'unknown error';
	const statuses = result?.response?.data?.statuses;
	if (!Array.isArray(statuses) || statuses.length === 0) return 'no order status returned';
	const failed = statuses.find((s: any) => s && typeof s === 'object' && 'error' in s);
	return failed ? failed.error : null;
}

/** Our own actual average fill price for a placed order, straight from HL's response - not any trader-side price. */
export function extractAvgFillPrice(result: any): number | null {
	const statuses = result?.response?.data?.statuses;
	if (!Array.isArray(statuses)) return null;
	for (const s of statuses) {
		const avgPx = s?.filled?.avgPx;
		if (avgPx != null) {
			const parsed = parseFloat(avgPx);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

export interface AssetMeta {
	name: string;
	szDecimals: number;
	maxLeverage: number;
}

/**
 * Thin wrapper around the `hyperliquid` SDK and its public /info REST API.
 *
 * Two known signing quirks of this phantom-agent-key setup, both load-
 * bearing; do not "fix" them without testing against a live order first:
 *   - `reduce_only: true` breaks signature recovery. Always false; closes
 *     and reduces are just opposite-direction orders, which Hyperliquid
 *     nets against the existing position automatically.
 *   - `grouping: 'normalTpsl'` breaks signature recovery too. Always 'na'.
 *     (This is also why this project doesn't place exchange-side TP/SL ;
 *     a standalone trigger order with grouping 'na' is a structurally
 *     different, never-tested code path on the same fragile signer.)
 */
export class HyperliquidClient {
	private sdk: Hyperliquid | null = null;
	private liveMids: Record<string, string> | null = null;

	constructor(
		private agentKey: string,
		private walletAddress: string,
		private enableWs = false,
	) {}

	drainSlowCalls() {
		return slowCalls.drain();
	}

	async connect(): Promise<void> {
		this.sdk = new Hyperliquid({ privateKey: this.agentKey, walletAddress: this.walletAddress, enableWs: this.enableWs });
		await slowCalls.track('sdk.connect', () => withRaceTimeout(this.sdk!.connect(), HL_EXCHANGE_TIMEOUT_MS, 'sdk.connect'));
		if (this.enableWs) {
			// `webData2` (the one-shot "everything" feed: positions + account value)
			// is documented but currently rejected outright by HL's WS server -
			// confirmed via a raw wire-level test outside this SDK entirely
			// ("Error parsing JSON into valid websocket request"), not something
			// fixable client-side. `allMids` is the one live channel that does
			// work, so that's the only thing subscribed here; positions/account
			// value still need REST (see loadWallet.ts's shared poll loop).
			//
			// Subscribed via the raw ws message rather than the SDK's own
			// `subscribeToAllMids` wrapper: that wrapper runs every key through
			// `symbolConversion.convertSymbol`, which rewrites "BTC" to "BTC-PERP"
			// - a different keyspace than the bare-ticker REST /info allMids this
			// project uses everywhere else, silently breaking every markPx lookup.
			this.getSdk().ws.on('message', (msg: any) => {
				if (msg?.channel === 'allMids' && msg?.data?.mids) this.liveMids = msg.data.mids;
			});
			this.getSdk().ws.sendMessage({ method: 'subscribe', subscription: { type: 'allMids' } });
		}
	}

	/** Live mark prices pushed over WS, or null if not subscribed/nothing received yet - callers should fall back to `getAllMids()` (REST) in that case. */
	getLiveMids(): Record<string, string> | null {
		return this.sdk?.isWebSocketConnected() ? this.liveMids : null;
	}

	private getSdk(): Hyperliquid {
		if (!this.sdk) throw new Error('HyperliquidClient not connected; call connect() first');
		return this.sdk;
	}

	async getMeta(): Promise<{ universe: AssetMeta[] }> {
		return postInfo({ type: 'meta' });
	}

	async getAllMids(): Promise<Record<string, string>> {
		return postInfo({ type: 'allMids' });
	}

	/** Per-coin hourly funding rate (as a decimal, e.g. 0.0000125 = 0.00125%/hr) - HL's own live number, not derivable from clearinghouseState. */
	async getFundingRates(): Promise<Record<string, number>> {
		const [meta, assetCtxs] = await postInfo({ type: 'metaAndAssetCtxs' });
		const rates: Record<string, number> = {};
		meta.universe.forEach((asset: AssetMeta, i: number) => {
			const funding = parseFloat(assetCtxs[i]?.funding);
			if (Number.isFinite(funding)) rates[asset.name] = funding;
		});
		return rates;
	}

	async getPositions(): Promise<HyperliquidPosition[]> {
		const data = await postInfo({ type: 'clearinghouseState', user: this.walletAddress });
		return data.assetPositions.filter((p: any) => parseFloat(p.position.szi) !== 0).map((p: any) => p.position);
	}

	async getAccountValueUsd(): Promise<number> {
		const data = await postInfo({ type: 'clearinghouseState', user: this.walletAddress });
		return parseFloat(data.marginSummary.accountValue);
	}

	/**
	 * Ground-truth fill history straight from the exchange - independent of
	 * this daemon's own logs, so it's what reconciliation checks compare
	 * against. Each fill's `oid` matches the order id this project's own
	 * `opened`/`closed`/`increased`/`reduced` log lines record from
	 * `placeOrder`'s response, so fills can be matched 1:1 back to a
	 * specific tracked action. `dir` is HL's own "Open Long"/"Close
	 * Short"/etc. classification.
	 */
	async getUserFills(): Promise<HyperliquidFill[]> {
		return postInfo({ type: 'userFills', user: this.walletAddress, aggregateByTime: true });
	}

	/** Deposits/withdrawals/transfers - separate from trading fills entirely. */
	async getLedgerUpdates(): Promise<HyperliquidLedgerUpdate[]> {
		return postInfo({ type: 'userNonFundingLedgerUpdates', user: this.walletAddress });
	}

	/**
	 * HL's own last-24h account-value series (the "day" window of its `portfolio`
	 * endpoint) - used as the 24h-ago baseline for the dashboard's balance-change
	 * display. Deliberately not reconstructed from ledger updates + fills locally:
	 * that would also need funding payments and unrealized PnL on open positions,
	 * neither of which this client fetches anywhere, whereas HL already computes
	 * this series itself.
	 */
	async getDailyAccountValueHistory(): Promise<{ time: number; accountValueUsd: number }[]> {
		const periods = await postInfo({ type: 'portfolio', user: this.walletAddress });
		const day = (periods as [string, { accountValueHistory: [number, string][] }][]).find(([period]) => period === 'day');
		return (day?.[1]?.accountValueHistory ?? []).map(([time, value]) => ({ time, accountValueUsd: parseFloat(value) }));
	}

	/**
	 * Approved API agent wallets under this account, straight from Hyperliquid
	 * itself - not derivable locally, since `HL_AGENT_KEY` is just a raw
	 * private key with no expiry encoded in it (unlike Invo's JWT refresh
	 * token). `validUntil` is an epoch-ms timestamp, or absent for an agent
	 * approved with no expiration at all.
	 */
	async getExtraAgents(): Promise<{ address: string; name: string | null; validUntil: number | null }[]> {
		return postInfo({ type: 'extraAgents', user: this.walletAddress });
	}

	async setLeverage(coin: string, leverage: number): Promise<unknown> {
		return slowCalls.track('updateLeverage', () =>
			withRaceTimeout(this.getSdk().exchange.updateLeverage(toSdkCoin(coin), 'isolated', leverage), HL_EXCHANGE_TIMEOUT_MS, 'updateLeverage'),
		);
	}

	async placeMarketOrder(
		coin: string,
		isBuy: boolean,
		size: string,
		szDecimals: number,
		slippagePct = 0.02,
	): Promise<unknown> {
		const mids = await this.getAllMids();
		const mid = parseFloat(mids[coin]);
		if (!mid) throw new Error(`No mid price for ${coin}`);

		const rawPx = isBuy ? mid * (1 + slippagePct) : mid * (1 - slippagePct);
		const limitPx = roundToValidLimitPx(rawPx, szDecimals);

		return slowCalls.track('placeOrder', () =>
			withRaceTimeout(
				this.getSdk().exchange.placeOrder({
					coin: toSdkCoin(coin),
					is_buy: isBuy,
					sz: parseFloat(size),
					limit_px: limitPx,
					order_type: { limit: { tif: 'Ioc' } },
					reduce_only: false,
					grouping: 'na',
					builder: INVO_BUILDER,
				}),
				HL_EXCHANGE_TIMEOUT_MS,
				'placeOrder',
			),
		);
	}

	/** Fully flattens whatever position currently exists for this coin. */
	async closePosition(coin: string, szDecimals: number): Promise<unknown> {
		const positions = await this.getPositions();
		const pos = positions.find((p) => p.coin === coin);
		if (!pos) throw new Error(`No open position for ${coin}`);

		const size = Math.abs(parseFloat(pos.szi));
		const isLong = parseFloat(pos.szi) > 0;
		return this.placeMarketOrder(coin, !isLong, size.toString(), szDecimals, 0.02);
	}
}
