import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { InvoClient } from '../clients/invo-client.js';
import { loadConfig } from '../config/env.js';
import { buildReconcileReport } from '../core/reconcile-report.js';
import { ConfigStore } from '../services/config-store.js';
import { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import { resolveRootDir } from '../services/root-dir.js';
import { StateStore } from '../services/state-store.js';
import type { ClosedInvestment, OpenInvestment } from '../types.js';

// Audits this daemon's actual behavior against ground truth from TWO
// independent sources it doesn't otherwise use: Invo's own closed-investment
// history (isOpen: false - never consulted by the live reconciler, whose
// source of truth is isOpen: true only) and Hyperliquid's own userFills
// (exchange-side fill history, independent of anything this project itself
// logged). Read-only; places no orders, changes no state.

const ROOT_DIR = resolveRootDir(import.meta.url);

function parseArgs() {
	const hoursArg = process.argv.find((a) => a.startsWith('--hours='));
	const hours = hoursArg ? parseFloat(hoursArg.split('=')[1]) : 6;
	return { windowMs: hours * 60 * 60 * 1000 };
}

function loadLogEvents(sinceMs: number): Record<string, unknown>[] {
	const dir = join(ROOT_DIR, 'logs');
	let files: string[];
	try {
		files = readdirSync(dir).filter((f) => f.startsWith('auto-copy-') && f.endsWith('.log'));
	} catch {
		return [];
	}
	const events: Record<string, unknown>[] = [];
	for (const f of files) {
		let raw: string;
		try {
			raw = readFileSync(join(dir, f), 'utf8');
		} catch {
			continue;
		}
		for (const line of raw.split('\n')) {
			if (!line.trim()) continue;
			let obj: any;
			try {
				obj = JSON.parse(line);
			} catch {
				continue;
			}
			const ts = Date.parse(obj.ts);
			if (Number.isFinite(ts) && ts >= sinceMs) events.push(obj);
		}
	}
	return events;
}

async function main() {
	const { windowMs } = parseArgs();
	const sinceMs = Date.now() - windowMs;
	const dbPath = join(ROOT_DIR, 'data/sentinel.db');
	const configStore = new ConfigStore(dbPath);
	const config = await loadConfig(configStore);
	if (!config.configured) {
		console.error(JSON.stringify({ type: 'reconcile_fatal', message: `Not configured yet: missing ${config.missing.join(', ')}. Run the setup wizard in the dashboard, or set these in .env.` }));
		process.exit(2);
	}

	const invo = new InvoClient(config.invoRefreshToken);
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const stateStore = new StateStore(dbPath, () => {});
	const ignoredStore = new IgnoredTradesStore(dbPath, () => {});
	const state = stateStore.load();
	const ignored = ignoredStore.load();
	const logEvents = loadLogEvents(sinceMs);

	const hlUserFills = await hl.getUserFills().catch(() => []);

	const portfolios = await invo.getFollowedPortfolios();
	const invoOpenInvestmentsByPortfolio = new Map<string, OpenInvestment[]>();
	const invoClosedInvestmentsByPortfolio = new Map<string, ClosedInvestment[]>();
	for (const portfolio of portfolios) {
		const [openInvestments, closedInvestments] = await Promise.all([
			invo.getOpenInvestments(portfolio.id).catch(() => []),
			invo.getClosedInvestments(portfolio.id, 1, 30).catch(() => []),
		]);
		invoOpenInvestmentsByPortfolio.set(portfolio.id, openInvestments);
		invoClosedInvestmentsByPortfolio.set(portfolio.id, closedInvestments);
	}

	const report = buildReconcileReport({
		state,
		ignored,
		logEvents,
		invoOpenInvestmentsByPortfolio,
		invoClosedInvestmentsByPortfolio,
		hlUserFills,
		sinceMs,
		windowMs,
	});

	console.log(JSON.stringify(report, null, 2));
	process.exit(report.actionableIssueCount > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error(JSON.stringify({ type: 'reconcile_fatal', message: e.message }));
	process.exit(2);
});
