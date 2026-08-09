import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';
import { InvoClient } from '../clients/invo-client.js';
import { loadConfig } from '../config/env.js';
import { IgnoredTradesStore } from '../services/ignored-trades-store.js';
import { StateStore } from '../services/state-store.js';

// Audits this daemon's actual behavior against ground truth from TWO
// independent sources it doesn't otherwise use: Invo's own closed-investment
// history (isOpen: false — never consulted by the live reconciler, whose
// source of truth is isOpen: true only) and Hyperliquid's own userFills
// (exchange-side fill history, independent of anything this project itself
// logged). Read-only; places no orders, changes no state.

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DELAYED_CLOSE_THRESHOLD_MS = 5 * 60_000; // flag closes slower than this as worth a look

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
	const config = loadConfig();

	const invo = new InvoClient(config.invoRefreshToken);
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	const stateStore = new StateStore(join(ROOT_DIR, '.copy-state.json'), () => {});
	const ignoredStore = new IgnoredTradesStore(join(ROOT_DIR, '.copy-ignored.json'), () => {});
	const state = stateStore.load();
	const ignored = ignoredStore.load();
	const events = loadLogEvents(sinceMs);

	const eventsByBaseId = new Map<string, any[]>();
	for (const e of events) {
		if (typeof e.baseId !== 'string') continue;
		const list = eventsByBaseId.get(e.baseId) ?? [];
		list.push(e);
		eventsByBaseId.set(e.baseId, list);
	}

	const issues: Record<string, unknown>[] = [];

	// --- Source 1: HL's own fill history, independent of our logs ---
	const fills = await hl.getUserFills().catch(() => [] as any[]);
	const fillsByOid = new Map<number, any>(fills.map((f: any) => [f.oid, f]));
	const loggedOids = new Set<number>();
	for (const e of events) {
		const statuses = (e as any).hlResult?.response?.data?.statuses;
		if (Array.isArray(statuses)) {
			for (const s of statuses) {
				if (s?.filled?.oid) loggedOids.add(s.filled.oid);
			}
		}
	}
	for (const oid of loggedOids) {
		if (!fillsByOid.has(oid)) {
			issues.push({
				type: 'unverified_fill',
				oid,
				detail: 'daemon logged this order as filled but HL userFills has no matching fill in the lookback window',
			});
		}
	}

	// --- Source 2: Invo's own trader-side history (open + closed) ---
	const portfolios = await invo.getFollowedPortfolios();
	for (const portfolio of portfolios) {
		const [openInvestments, closedInvestments] = await Promise.all([
			invo.getOpenInvestments(portfolio.id).catch(() => []),
			invo.getClosedInvestments(portfolio.id, 1, 30).catch(() => []),
		]);

		// Open-side: every currently open investment should be tracked, ignored, or an explained conflict.
		for (const inv of openInvestments) {
			const tracked = !!state[inv.baseId];
			const isIgnored = !!ignored[inv.baseId];
			const hasConflictLog = (eventsByBaseId.get(inv.baseId) ?? []).some(
				(e) => e.type === 'existing_position_conflict',
			);
			if (!tracked && !isIgnored && !hasConflictLog) {
				issues.push({
					type: 'unexplained_untracked_open',
					baseId: inv.baseId,
					coin: inv.ticker,
					trader: inv.owner?.username,
					createdAt: inv.createdAt,
					detail: 'open on trader side, not tracked, not ignored, no conflict log explains it',
				});
			}
		}

		// Close-side: every recently-closed investment we were ever tracking should have a corresponding close.
		for (const inv of closedInvestments) {
			const closedAtMs = Date.parse(inv.closedAt);
			if (!Number.isFinite(closedAtMs) || closedAtMs < sinceMs) continue;

			const baseEvents = eventsByBaseId.get(inv.baseId) ?? [];
			const wasTrackedByUs = baseEvents.some((e) => e.type === 'opened' || e.type === 'auto_adopted');
			if (!wasTrackedByUs) continue; // never ours to close (ignored/conflict/unknown coin/etc.)

			const closeEvent = baseEvents.find((e) => e.type === 'closed');
			const skipCloseEvent = baseEvents.find((e) => e.type === 'skip_close');
			if (!closeEvent && skipCloseEvent) {
				// Explained: we tried to close and found no real HL position —
				// almost always means the original "opened" never actually
				// filled (see hlResult on the opened event to confirm). Not a
				// missed close, but still worth surfacing since it means the
				// open silently failed at some point.
				issues.push({
					type: 'open_never_filled',
					severity: 'info',
					baseId: inv.baseId,
					coin: inv.ticker,
					trader: inv.owner?.username,
					detail:
						'daemon logged "opened" but later found no real HL position to close — the original order likely never actually filled; check that opened event\'s hlResult',
				});
				continue;
			}
			if (!closeEvent) {
				issues.push({
					type: 'missed_close',
					baseId: inv.baseId,
					coin: inv.ticker,
					trader: inv.owner?.username,
					traderClosedAt: inv.closedAt,
					reasonClosed: inv.reasonClosed,
					detail: 'trader closed this investment; daemon was tracking it but has no closed log event for it in the window',
				});
				continue;
			}

			const ourCloseMs = Date.parse(closeEvent.ts as string);
			const delayMs = ourCloseMs - closedAtMs;
			if (delayMs > DELAYED_CLOSE_THRESHOLD_MS) {
				issues.push({
					type: 'delayed_close',
					baseId: inv.baseId,
					coin: inv.ticker,
					trader: inv.owner?.username,
					traderClosedAt: inv.closedAt,
					ourClosedAt: closeEvent.ts,
					delaySeconds: Math.round(delayMs / 1000),
				});
			}
		}
	}

	const actionableIssues = issues.filter((i: any) => i.severity !== 'info');
	const report = {
		windowHours: windowMs / 3_600_000,
		checkedAt: new Date().toISOString(),
		portfoliosChecked: portfolios.length,
		fillsChecked: loggedOids.size,
		issueCount: issues.length,
		actionableIssueCount: actionableIssues.length,
		issues,
	};
	console.log(JSON.stringify(report, null, 2));
	process.exit(actionableIssues.length > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error(JSON.stringify({ type: 'reconcile_fatal', message: e.message }));
	process.exit(2);
});
