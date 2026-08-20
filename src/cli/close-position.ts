import { join } from 'path';
import { HyperliquidClient, extractAvgFillPrice, orderFillError } from '../clients/hyperliquid-client.js';
import { loadConfig } from '../config/env.js';
import { ClosedTradesStore } from '../services/closed-trades-store.js';
import { ConfigStore } from '../services/config-store.js';
import { createLogger } from '../services/logger.js';
import { resolveRootDir } from '../services/root-dir.js';
import { StateStore } from '../services/state-store.js';

// Manual emergency stop for one coin. Stopping auto-copy.ts (Ctrl+C) does
// NOT close anything; positions stay open on Hyperliquid regardless of
// whether the daemon is running. This is how you actually flatten one.
// If a tracked baseId maps to this coin, its entry is cleared from state
// too, so the daemon doesn't try to act on a position that no longer
// exists.

const ROOT_DIR = resolveRootDir(import.meta.url);

async function main() {
	const [coin] = process.argv.slice(2);
	if (!coin) {
		console.error('Usage: npm run close -- <coin>');
		process.exit(1);
	}

	const configStore = new ConfigStore(join(ROOT_DIR, 'data/sentinel.db'));
	const config = await loadConfig(configStore);
	if (!config.configured) {
		console.error(`Not configured yet: missing ${config.missing.join(', ')}. Run the setup wizard in the dashboard, or set these in .env.`);
		process.exit(1);
	}
	const log = createLogger({
		name: 'close-position',
		dir: join(ROOT_DIR, 'logs'),
		retentionHours: config.logRetentionHours,
		maxTotalMb: config.logMaxTotalMb,
	});
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const positions = await hl.getPositions();
	const pos = positions.find((p) => p.coin === coin);
	if (!pos) {
		console.error(`No open position for ${coin}.`);
		process.exit(1);
	}

	const qtyBefore = pos.szi;
	const meta = await hl.getMeta();
	const szDecimals = meta.universe.find((a) => a.name === coin)?.szDecimals ?? 4;
	const closeResult = await hl.closePosition(coin, szDecimals);

	const fillError = orderFillError(closeResult);
	if (fillError) {
		console.error(`Close order rejected by Hyperliquid: ${fillError}`);
		console.error(JSON.stringify(closeResult, null, 2));
		process.exit(1);
	}

	const stateStore = new StateStore(join(ROOT_DIR, 'data/sentinel.db'), log);
	const closedTradesStore = new ClosedTradesStore(join(ROOT_DIR, 'data/sentinel.db'), log);
	const state = stateStore.load();
	const clearedBaseIds = Object.keys(state).filter((baseId) => state[baseId].coin === coin);
	const closingPrice = extractAvgFillPrice(closeResult);
	for (const baseId of clearedBaseIds) {
		const entry = state[baseId];
		closedTradesStore.record({
			baseId,
			coin: entry.coin,
			isBuy: entry.isBuy,
			leverage: entry.leverage,
			marginUsd: entry.marginUsd,
			portfolioId: entry.portfolioId,
			ownerUsername: entry.ownerUsername,
			entryPrice: entry.entryPrice,
			closingPrice: closingPrice ?? undefined,
			openedAt: entry.openedAt,
			closedAt: new Date().toISOString(),
			closeReason: 'manual_close',
		});
		delete state[baseId];
	}
	if (clearedBaseIds.length > 0) stateStore.save(state);

	const result = { status: 'closed', coin, qtyBefore, hlResult: closeResult, clearedBaseIds };
	console.log(JSON.stringify(result, null, 2));
	log({ type: 'manual_close', ...result });
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
