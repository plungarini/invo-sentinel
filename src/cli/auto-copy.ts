import { join } from 'path';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { InvoClient } from '../clients/invo-client.js';
import { loadConfig, loadEmergencyConfig, loadRiskConfig, loadTraderModeConfig, loadUpdateConfig } from '../config/env.js';
import { PortfolioPoller } from '../core/portfolio-poller.js';
import { PositionSync } from '../core/position-sync.js';
import { Reconciler } from '../core/reconciler.js';
import { TraderModeSync } from '../core/trader-mode-sync.js';
import { CloidAttributionStore } from '../services/cloid-attribution-store.js';
import { ClosedTradesStore } from '../services/closed-trades-store.js';
import { ConfigStore } from '../services/config-store.js';
import { shouldUseConsoleTui, startConsoleTui } from '../services/console-tui.js';
import { CycleCache } from '../services/cycle-cache.js';
import { FollowedPortfoliosStore } from '../services/followed-portfolios-store.js';
import { pingFail, pingFailAwaited, pingStart, pingSuccess } from '../services/healthcheck.js';
import { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import { createLogger, type Logger } from '../services/logger.js';
import { PollCacheService } from '../services/poll-cache.js';
import { computeSafePollIntervalMs } from '../services/poll-schedule.js';
import { PortfolioRiskStore } from '../services/portfolio-risk-store.js';
import { isCompiledBuild, resolveRootDir } from '../services/root-dir.js';
import { isVersionRollbackBlocked, performUpdate } from '../services/self-updater.js';
import { StateStore } from '../services/state-store.js';
import { checkForUpdate } from '../services/update-checker.js';
import { startUiSupervisor, type UiSupervisor } from '../services/ui-supervisor.js';
import { APP_VERSION } from '../version.js';

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

const ROOT_DIR = resolveRootDir(import.meta.url);

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

// Decoupled from pollIntervalMs on purpose - a trading-cycle-scale check
// against GitHub would be wasteful and pointless (releases don't ship every
// few seconds); this uses its own long interval instead, well inside
// GitHub's 60/hr unauthenticated rate limit.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * No-op entirely on a source/`tsx` checkout (`isCompiledBuild()` false) -
 * that setup updates via `git pull`, not this. Runs at most once per
 * `UPDATE_CHECK_INTERVAL_MS`, gated by its own `nextCheckAt` closure rather
 * than the trading poll loop's cadence - except for the two manual flags
 * below, which bypass both the interval and (for `updateManualApplyRequested`)
 * the `autoUpdate` toggle. The UI never calls GitHub or touches `bin/`
 * itself (see `checkForUpdatesNow`/`applyUpdateNow` in `ui/app/settings/
 * actions.ts`) - it only flips a `ConfigStore` row, and this function is the
 * sole place that acts on it, same "one caller" discipline as every other
 * store here. On finding + successfully staging a newer release, exits the
 * process (special code 42) so `start.bat`/`start.sh` - the same wrapper
 * that already restarts on any crash - can detect the pending-update marker
 * and perform the actual file swap with this process fully exited (no
 * self-file-lock hazard on any OS).
 */
function createUpdateChecker(rootDir: string, configStore: ConfigStore, log: Logger, uiSupervisor: UiSupervisor) {
	let nextCheckAt = isCompiledBuild() ? Date.now() : Infinity;
	return async function maybeCheckForUpdate(): Promise<void> {
		if (!isCompiledBuild()) return;

		const manualCheck = configStore.get('updateManualCheckRequested') === 'true';
		const manualApply = configStore.get('updateManualApplyRequested') === 'true';
		const manual = manualCheck || manualApply;
		if (!manual && Date.now() < nextCheckAt) return;
		if (manualCheck) configStore.set('updateManualCheckRequested', 'false');
		if (manualApply) configStore.set('updateManualApplyRequested', 'false');
		nextCheckAt = Date.now() + UPDATE_CHECK_INTERVAL_MS;

		if (!manual && !loadUpdateConfig(configStore).autoUpdate) return;
		if (manual) log({ type: 'update_manual_check_requested', apply: manualApply });

		const result = await checkForUpdate(APP_VERSION, log);
		// Persisted so the dashboard's Settings page can show current/latest
		// version without the UI process making its own GitHub call - same
		// reasoning as followed-portfolios-store.ts keeping the UI out of
		// direct Invo calls: one caller, one rate-limit budget to manage.
		configStore.setMany({ updateLastCheckedAt: new Date().toISOString(), updateLatestVersionSeen: result.latestVersion });
		if (!result.updateAvailable || !result.asset) return;

		// A plain "check now" only ever refreshes latestVersionSeen for the
		// settings page to show - it never stages/restarts on its own unless
		// autoUpdate also happens to be on. Only "update now" forces this
		// regardless of that toggle.
		if (!manualApply && !loadUpdateConfig(configStore).autoUpdate) return;

		if (isVersionRollbackBlocked(rootDir, result.latestVersion)) {
			log({ type: 'update_skipped_known_bad', version: result.latestVersion });
			return;
		}

		const staged = await performUpdate({ rootDir, asset: result.asset, latestVersion: result.latestVersion, log });
		if (staged) {
			log({ type: 'update_restarting', fromVersion: APP_VERSION, toVersion: result.latestVersion });
			// The wrapper script swaps bin/ui/'s files the moment this process
			// exits - the UI child has to be actually gone first, not just
			// signaled, or the swap can race a still-running node process.
			await uiSupervisor.stop();
			process.exit(42);
		}
	};
}

async function main() {
	const { dryRun, minMarginPct, maxMarginPct } = parseArgs();
	const dbPath = join(ROOT_DIR, 'data/sentinel.db');
	const configStore = new ConfigStore(dbPath);
	let config = await loadConfig(configStore, { minMarginPct, maxMarginPct });

	// The TUI, when active, owns the terminal (its own redraw loop shows a
	// summarized feed) - raw JSON lines would just scroll underneath it, so
	// the logger is told to skip its own stdout mirror in that case. File
	// logging (still the full JSON detail, used by `npm run reconcile` etc.)
	// is unaffected either way.
	const useTui = shouldUseConsoleTui();
	const rawLog = createLogger({
		name: 'auto-copy',
		dir: join(ROOT_DIR, 'logs'),
		retentionHours: config.logRetentionHours,
		maxTotalMb: config.logMaxTotalMb,
		quiet: useTui,
	});
	const tui = useTui ? startConsoleTui(ROOT_DIR) : null;
	const log: Logger = tui ? (obj) => { rawLog(obj); tui.onLog(obj); } : rawLog;
	configStore.setLogger(log);

	// Started before the setup-wizard wait below, not after - the dashboard
	// (including the wizard itself) has to be reachable on a completely
	// unconfigured first run, not just once the daemon is fully up.
	const uiSupervisor = startUiSupervisor({ rootDir: ROOT_DIR, log });

	// Never let an unforeseen error kill the process silently. Log fully
	// (stdout + logs/) and exit non-zero so a process supervisor (pm2,
	// systemd Restart=always, or scripts/run.sh) can restart clean; safer
	// than trying to "keep going" after truly unexpected state.
	process.on('uncaughtException', async (err) => {
		log({ type: 'fatal', source: 'uncaughtException', message: err.message, stack: err.stack });
		await uiSupervisor.stop();
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
		await uiSupervisor.stop();
		await pingFailAwaited(config.healthcheckPingUrl);
		process.exit(1);
	});
	// No handler installed previously - Node's default SIGINT/SIGTERM
	// behavior exits immediately without a chance to stop the UI child
	// first, which would leave it orphaned (and fighting the next start for
	// port 4400) on a plain Ctrl+C or `stop.bat`/service-manager shutdown.
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, async () => {
			await uiSupervisor.stop();
			process.exit(0);
		});
	}

	// First run on a fresh install: no crash-on-missing-config, just idle
	// until the setup wizard (or a hand-edited .env) supplies the 3 required
	// secrets - polled on a short fixed interval, independent of
	// pollIntervalMs, since that value itself might not be configured yet.
	if (!config.configured) {
		log({ type: 'awaiting_configuration', missing: config.missing });
		while (!config.configured) {
			await new Promise((r) => setTimeout(r, 5_000));
			config = await loadConfig(configStore, { minMarginPct, maxMarginPct });
		}
		log({ type: 'configuration_complete' });
	}

	const invo = new InvoClient(config.invoRefreshToken);
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const meta = await hl.getMeta();
	const stateStore = new StateStore(dbPath, log);
	const ignoredStore = new IgnoredTradesStore(dbPath, log);
	// Deliberately still JSON, not SQLite - the one user-hand-edited store
	// (see portfolio-risk-store.ts); keeping it a plain file means the user
	// can open and edit it directly, same as today.
	const portfolioRiskStore = new PortfolioRiskStore(join(ROOT_DIR, 'data/.copy-portfolio-risk.json'), log);
	const followedPortfoliosStore = new FollowedPortfoliosStore(dbPath, log);
	const cloidAttributionStore = new CloidAttributionStore(dbPath, log);
	const closedTradesStore = new ClosedTradesStore(dbPath, log);
	const cycleCache = new CycleCache(hl);
	const pollCache = new PollCacheService(log);
	// Trader mode mirrors onto a portfolio owned by this SAME Invo account
	// (the one already authenticated via invoRefreshToken above) - reuses
	// `invo` rather than a second client/token.
	const traderModeSync = new TraderModeSync({ invo, log, dryRun });
	const sync = new PositionSync({
		hl,
		invo,
		log,
		staleEntry: config.staleEntry,
		dryRun,
		assetMeta: meta.universe,
		cycleCache,
		closedTrades: closedTradesStore,
		traderModeSync,
	});
	const poller = new PortfolioPoller(invo, log, pollCache);
	const reconciler = new Reconciler(
		poller,
		sync,
		hl,
		invo,
		stateStore,
		ignoredStore,
		portfolioRiskStore,
		followedPortfoliosStore,
		cloidAttributionStore,
		cycleCache,
		() => loadRiskConfig(configStore, { minMarginPct, maxMarginPct }),
		() => loadTraderModeConfig(configStore),
		() => loadEmergencyConfig(configStore),
		log,
	);

	log({
		type: 'started',
		version: APP_VERSION,
		autoUpdate: config.update.autoUpdate,
		minMarginPct: config.risk.minMarginPct * 100,
		maxMarginPct: config.risk.maxMarginPct * 100,
		maxLeverage: config.risk.maxLeverage ?? null,
		staleEntryMaxAgeMinutes: config.staleEntry.maxAgeMinutes,
		staleEntryMaxProfitPct: config.staleEntry.maxProfitPct,
		pollIntervalMs: config.pollIntervalMs,
		trackedPositions: Object.keys(stateStore.load()).length,
		ignoredTrades: Object.keys(ignoredStore.load()).length,
		portfolioRiskOverrides: portfolioRiskStore.load().filter((e) => e.minMarginPct != null || e.maxMarginPct != null)
			.length,
		dryRun,
		traderModeEnabled: config.traderMode.enabled,
		traderModePortfolioId: config.traderMode.portfolioId ?? null,
		emergencyNoNewPositions: config.emergency.noNewPositions,
		emergencyFullStop: config.emergency.fullStop,
	});

	const maybeCheckForUpdate = createUpdateChecker(ROOT_DIR, configStore, log, uiSupervisor);

	pingStart(config.healthcheckPingUrl, log);
	const first = await reconciler.run();
	// null only when the cycle was skipped for a transient, self-recovering
	// rate limit (see reconciler.ts) - keep the last known counts rather
	// than resetting to 0, which would undo poll-schedule.ts's throttle
	// right when it's most needed (immediately after a rate limit).
	let followedPortfolioCount = first.followedPortfolioCount ?? 0;
	let adHocPortfolioCount = first.adHocPortfolioCount ?? 0;
	await reconciler.logUntrackedPositions();
	pingSuccess(config.healthcheckPingUrl, log);
	await maybeCheckForUpdate();

	// Full-stop means every cycle is a no-op fetch-nothing early return (see
	// reconciler.ts) - cheap either way, but there's no reason to burn a full
	// pollIntervalMs-paced loop iteration (plus its cycle_start/cycle_complete
	// log pair) doing literally nothing; back off to a slow idle cadence
	// instead, same idea as the pre-configured await-setup loop above.
	const FULL_STOP_IDLE_MS = 30_000;

	while (true) {
		// Scales the gap between cycles up once enough portfolios are followed
		// that the configured pollIntervalMs alone would exceed Invo's own
		// Cloudflare rate limit (500 req/300s per IP, confirmed live
		// 2026-08-11) - see poll-schedule.ts. A no-op at typical follow counts.
		const extraCallsPerCycle = adHocPortfolioCount; // one get_investments per ad-hoc (manually-mimicked) portfolio
		const safeDelayMs = computeSafePollIntervalMs(followedPortfolioCount, config.pollIntervalMs, extraCallsPerCycle);
		if (safeDelayMs > config.pollIntervalMs) {
			log({ type: 'poll_interval_throttled', followedPortfolioCount, adHocPortfolioCount, pollIntervalMs: config.pollIntervalMs, delayMs: safeDelayMs });
		}
		// Re-read fresh every iteration (not just once at boot) so a
		// settings-page full-stop toggle slows the loop down on the very next
		// wait, not just once the daemon happens to restart.
		const fullStop = loadEmergencyConfig(configStore).fullStop;
		const delayMs = fullStop ? Math.max(safeDelayMs, FULL_STOP_IDLE_MS) : safeDelayMs;
		await new Promise((r) => setTimeout(r, delayMs));
		pingStart(config.healthcheckPingUrl, log);
		try {
			const result = await reconciler.run();
			if (result.followedPortfolioCount != null) followedPortfolioCount = result.followedPortfolioCount;
			if (result.adHocPortfolioCount != null) adHocPortfolioCount = result.adHocPortfolioCount;
			pingSuccess(config.healthcheckPingUrl, log);
			await maybeCheckForUpdate();
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
