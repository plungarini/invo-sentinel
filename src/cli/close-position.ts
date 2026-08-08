import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../services/logger.js';
import { StateStore } from '../services/state-store.js';

// Manual emergency stop for one coin. Stopping auto-copy.ts (Ctrl+C) does
// NOT close anything; positions stay open on Hyperliquid regardless of
// whether the daemon is running. This is how you actually flatten one.
// If a tracked baseId maps to this coin, its entry is cleared from state
// too, so the daemon doesn't try to act on a position that no longer
// exists.

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function main() {
	const [coin] = process.argv.slice(2);
	if (!coin) {
		console.error('Usage: npm run close -- <coin>');
		process.exit(1);
	}

	const config = loadConfig();
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
	const closeResult = await hl.closePosition(coin);

	const stateStore = new StateStore(join(ROOT_DIR, '.copy-state.json'), log);
	const state = stateStore.load();
	const clearedBaseIds = Object.keys(state).filter((baseId) => state[baseId].coin === coin);
	for (const baseId of clearedBaseIds) delete state[baseId];
	if (clearedBaseIds.length > 0) stateStore.save(state);

	const result = { status: 'closed', coin, qtyBefore, hlResult: closeResult, clearedBaseIds };
	console.log(JSON.stringify(result, null, 2));
	log({ type: 'manual_close', ...result });
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
