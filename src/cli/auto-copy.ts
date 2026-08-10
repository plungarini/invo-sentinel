import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { InvoClient } from '../clients/invo-client.js';
import { loadConfig } from '../config/env.js';
import { PortfolioPoller } from '../core/portfolio-poller.js';
import { PositionSync } from '../core/position-sync.js';
import { Reconciler } from '../core/reconciler.js';
import { pingFail, pingFailAwaited, pingStart, pingSuccess } from '../services/healthcheck.js';
import { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import { createLogger } from '../services/logger.js';
import { PortfolioRiskStore } from '../services/portfolio-risk-store.js';
import { StateStore } from '../services/state-store.js';

// No Claude/LLM in this loop. Mechanically mirrors every open/adjust/close
// on every portfolio you follow, on a plain polling cycle. The only
// guardrail: your own margin (as % of your current HL equity) for each
// mirrored trade is always kept inside [minMarginPct, maxMarginPct], and
// leverage is capped at maxLeverage if configured; regardless of what the
// trader used. Trades are never skipped, only resized. Closes always
// mirror fully, unclamped.
//
// See README.md for the full design rationale (why the feed isn't used,
// what entrySize actually means, the same-coin-multiple-traders limit).

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs() {
	const dryRun = process.argv.includes('--dry-run');
	const positional = process.argv.slice(2).filter((a) => a !== '--dry-run');
	const [minPctStr, maxPctStr] = positional;
	return {
		dryRun,
		minMarginPct: minPctStr !== undefined ? parseFloat(minPctStr) / 100 : undefined,
		maxMarginPct: maxPctStr !== undefined ? parseFloat(maxPctStr) / 100 : undefined,
	};
}

async function main() {
	const { dryRun, minMarginPct, maxMarginPct } = parseArgs();
	const config = loadConfig({ minMarginPct, maxMarginPct });

	const log = createLogger({
		name: 'auto-copy',
		dir: join(ROOT_DIR, 'logs'),
		retentionHours: config.logRetentionHours,
		maxTotalMb: config.logMaxTotalMb,
	});

	// Never let an unforeseen error kill the process silently. Log fully
	// (stdout + logs/) and exit non-zero so a process supervisor (pm2,
	// systemd Restart=always, or scripts/run.sh) can restart clean; safer
	// than trying to "keep going" after truly unexpected state.
	process.on('uncaughtException', async (err) => {
		log({ type: 'fatal', source: 'uncaughtException', message: err.message, stack: err.stack });
		await pingFailAwaited(config.healthcheckPingUrl);
		process.exit(1);
	});
	process.on('unhandledRejection', async (reason: any) => {
		log({
			type: 'fatal',
			source: 'unhandledRejection',
			message: reason?.message ?? String(reason),
			stack: reason?.stack,
		});
		await pingFailAwaited(config.healthcheckPingUrl);
		process.exit(1);
	});

	const invo = new InvoClient(config.invoRefreshToken);
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const meta = await hl.getMeta();
	const stateStore = new StateStore(join(ROOT_DIR, '.copy-state.json'), log);
	const ignoredStore = new IgnoredTradesStore(join(ROOT_DIR, '.copy-ignored.json'), log);
	const portfolioRiskStore = new PortfolioRiskStore(join(ROOT_DIR, '.copy-portfolio-risk.json'), log);
	const sync = new PositionSync({
		hl,
		invo,
		log,
		staleEntry: config.staleEntry,
		dryRun,
		assetMeta: meta.universe,
	});
	const poller = new PortfolioPoller(invo, log);
	const reconciler = new Reconciler(poller, sync, hl, stateStore, ignoredStore, portfolioRiskStore, config.risk, log);

	log({
		type: 'started',
		minMarginPct: config.risk.minMarginPct * 100,
		maxMarginPct: config.risk.maxMarginPct * 100,
		maxLeverage: config.risk.maxLeverage ?? null,
		staleEntryMaxAgeMinutes: config.staleEntry.maxAgeMinutes,
		staleEntryMaxProfitPct: config.staleEntry.maxProfitPct,
		pollIntervalMs: config.pollIntervalMs,
		trackedPositions: Object.keys(stateStore.load()).length,
		ignoredTrades: Object.keys(ignoredStore.load()).length,
		portfolioRiskOverrides: portfolioRiskStore.load().filter((e) => e.minMarginPct != null || e.maxMarginPct != null).length,
		dryRun,
	});

	pingStart(config.healthcheckPingUrl, log);
	await reconciler.run();
	await reconciler.logUntrackedPositions();
	pingSuccess(config.healthcheckPingUrl, log);

	while (true) {
		await new Promise((r) => setTimeout(r, config.pollIntervalMs));
		pingStart(config.healthcheckPingUrl, log);
		try {
			await reconciler.run();
			pingSuccess(config.healthcheckPingUrl, log);
		} catch (e: any) {
			log({ type: 'error', source: 'reconcile', message: e.message });
			pingFail(config.healthcheckPingUrl, log);
		}
	}
}

main().catch((e) => {
	console.error(e.message);
	process.exit(1);
});
