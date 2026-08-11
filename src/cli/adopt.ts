import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../services/logger.js';
import { StateStore } from '../services/state-store.js';

// One-off manual fixup for the genuinely ambiguous case Reconciler can't
// safely resolve on its own: several followed traders hold the same coin
// at once, so auto-copy.ts can't tell which one your existing real
// position belongs to. This teaches it explicitly. Places NO order and
// does NOT touch Invo's /dex/position/create; it only edits local state
// so future signals for that baseId are recognized (adjust/close) instead
// of tripping existing_position_conflict or being silently ignored.

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function genBaseShortId(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
	const bytes = randomBytes(10);
	let id = '';
	for (const b of bytes) id += chars[b % chars.length];
	return id;
}

async function main() {
	const [baseId, coin, side, leverageStr, marginUsdStr, ourBaseShortIdArg] = process.argv.slice(2);

	if (!baseId || !coin || !side || !leverageStr || !marginUsdStr) {
		console.error(
			'Usage: npm run adopt -- <traderBaseId> <coin> <long|short> <leverage> <yourMarginUsd> [ourBaseShortId]',
		);
		console.error('');
		console.error('  traderBaseId    baseId from the existing_position_conflict log line');
		console.error('  coin            e.g. AVAX');
		console.error('  long|short      direction of your existing position');
		console.error('  leverage        the leverage you have set on it');
		console.error('  yourMarginUsd   your current margin on this trade, in $; the baseline the');
		console.error('                  next trader-driven adjustment computes its delta against');
		console.error('  ourBaseShortId  optional; pass this if the position already has a real Invo');
		console.error('                  mimic record. If omitted, closes still happen on Hyperliquid;');
		console.error("                  Invo bookkeeping just won't link back to it.");
		process.exit(1);
	}
	if (side !== 'long' && side !== 'short') {
		console.error('side must be "long" or "short"');
		process.exit(1);
	}

	const config = loadConfig();
	const log = createLogger({
		name: 'adopt',
		dir: join(ROOT_DIR, 'logs'),
		retentionHours: config.logRetentionHours,
		maxTotalMb: config.logMaxTotalMb,
	});
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const positions = await hl.getPositions();
	const pos = positions.find((p) => p.coin === coin);
	if (!pos) {
		console.error(`No open Hyperliquid position found for ${coin}. Nothing to adopt.`);
		process.exit(1);
	}

	const stateStore = new StateStore(join(ROOT_DIR, 'data/.copy-state.json'), log);
	const state = stateStore.load();

	if (state[baseId]) {
		console.error(`baseId ${baseId} is already tracked:`);
		console.error(JSON.stringify(state[baseId], null, 2));
		console.error('Refusing to overwrite. Edit data/.copy-state.json by hand if you really need to change it.');
		process.exit(1);
	}

	state[baseId] = {
		coin,
		isBuy: side === 'long',
		leverage: parseInt(leverageStr, 10),
		marginUsd: parseFloat(marginUsdStr),
		ourBaseShortId: ourBaseShortIdArg || genBaseShortId(),
	};
	stateStore.save(state);

	console.log(
		JSON.stringify(
			{
				status: 'adopted',
				baseId,
				liveHlPosition: { coin: pos.coin, szi: pos.szi },
				trackedAs: state[baseId],
			},
			null,
			2,
		),
	);
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
