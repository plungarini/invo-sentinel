import { Hyperliquid } from 'hyperliquid';
import type { HyperliquidFill, HyperliquidPosition } from '../types.js';

// Required on every order for Invo compatibility.
const INVO_BUILDER = { address: '0x557edb253b1d7ed5f15b248a5a3fd919fa5d3c81', fee: 35 };

// The SDK's SymbolConversion layer expects "SOL-PERP"; the raw /info REST
// endpoints (meta, allMids, clearinghouseState) use bare "SOL".
function toSdkCoin(coin: string): string {
	return coin.includes('-') ? coin : `${coin}-PERP`;
}

// HL rejects a perp limit price that violates EITHER of two independent
// caps: 5 significant figures, AND at most (6 - szDecimals) decimal places.
// For a major like BTC the second cap never bites (price is large, few
// decimals needed); for a cheap coin like XAI/SAGA (sub-cent price) 5 sig
// figs alone lands well past the decimal-place cap and HL returns "Order
// has invalid price" — silently, inside a 200 OK, not a thrown error.
function roundToValidLimitPx(rawPx: number, szDecimals: number): number {
	const sigFigRounded = parseFloat(rawPx.toPrecision(5));
	const maxDecimals = Math.max(0, 6 - szDecimals);
	return parseFloat(sigFigRounded.toFixed(maxDecimals));
}

/**
 * HL's placeOrder responds 200 OK even when the exchange rejected the
 * order outright (e.g. bad price/size); the actual outcome is buried in
 * response.data.statuses[]. Callers must check this before treating an
 * order as real — recording tracked state or an Invo mimic off an order
 * that never actually filled silently corrupts both.
 */
export function orderFillError(result: any): string | null {
	if (result?.status !== 'ok') return result?.response ?? 'unknown error';
	const statuses = result?.response?.data?.statuses;
	if (!Array.isArray(statuses) || statuses.length === 0) return 'no order status returned';
	const failed = statuses.find((s: any) => s && typeof s === 'object' && 'error' in s);
	return failed ? failed.error : null;
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

	constructor(
		private agentKey: string,
		private walletAddress: string,
	) {}

	async connect(): Promise<void> {
		this.sdk = new Hyperliquid({ privateKey: this.agentKey, walletAddress: this.walletAddress, enableWs: false });
		await this.sdk.connect();
	}

	private getSdk(): Hyperliquid {
		if (!this.sdk) throw new Error('HyperliquidClient not connected; call connect() first');
		return this.sdk;
	}

	async getMeta(): Promise<{ universe: AssetMeta[] }> {
		const resp = await fetch('https://api.hyperliquid.xyz/info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'meta' }),
		});
		return resp.json();
	}

	async getAllMids(): Promise<Record<string, string>> {
		const resp = await fetch('https://api.hyperliquid.xyz/info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'allMids' }),
		});
		return resp.json();
	}

	async getPositions(): Promise<HyperliquidPosition[]> {
		const resp = await fetch('https://api.hyperliquid.xyz/info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'clearinghouseState', user: this.walletAddress }),
		});
		const data = await resp.json();
		return data.assetPositions.filter((p: any) => parseFloat(p.position.szi) !== 0).map((p: any) => p.position);
	}

	async getAccountValueUsd(): Promise<number> {
		const resp = await fetch('https://api.hyperliquid.xyz/info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'clearinghouseState', user: this.walletAddress }),
		});
		const data = await resp.json();
		return parseFloat(data.marginSummary.accountValue);
	}

	/**
	 * Ground-truth fill history straight from the exchange — independent of
	 * this daemon's own logs, so it's what reconciliation checks compare
	 * against. Each fill's `oid` matches the order id this project's own
	 * `opened`/`closed`/`increased`/`reduced` log lines record from
	 * `placeOrder`'s response, so fills can be matched 1:1 back to a
	 * specific tracked action. `dir` is HL's own "Open Long"/"Close
	 * Short"/etc. classification.
	 */
	async getUserFills(): Promise<HyperliquidFill[]> {
		const resp = await fetch('https://api.hyperliquid.xyz/info', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'userFills', user: this.walletAddress, aggregateByTime: true }),
		});
		return resp.json();
	}

	async setLeverage(coin: string, leverage: number): Promise<unknown> {
		return this.getSdk().exchange.updateLeverage(toSdkCoin(coin), 'isolated', leverage);
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

		return this.getSdk().exchange.placeOrder({
			coin: toSdkCoin(coin),
			is_buy: isBuy,
			sz: parseFloat(size),
			limit_px: limitPx,
			order_type: { limit: { tif: 'Ioc' } },
			reduce_only: false,
			grouping: 'na',
			builder: INVO_BUILDER,
		});
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
