import "server-only";
import { HyperliquidClient } from "@daemon/clients/hyperliquid-client.js";
import { getAppConfig } from "../daemon/paths.js";

let cached: Promise<HyperliquidClient> | null = null;

export function getHyperliquidClient(): Promise<HyperliquidClient> {
	if (!cached) {
		cached = (async () => {
			const config = getAppConfig();
			const client = new HyperliquidClient(config.hlAgentKey, config.walletAddress, true);
			await client.connect();
			return client;
		})().catch((e) => {
			cached = null; // don't cache a failed connect; retry on next call
			throw e;
		});
	}
	return cached;
}
