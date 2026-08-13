import type {
	ClosedInvestment,
	HyperliquidFill,
	IgnoredTradesMap,
	OpenInvestment,
	PositionStateMap,
} from '../types.js';

const DELAYED_CLOSE_THRESHOLD_MS = 5 * 60_000; // flag closes slower than this as worth a look

export interface ReconcileReportArgs {
	state: PositionStateMap;
	ignored: IgnoredTradesMap;
	/** Parsed JSON-line events from logs/auto-copy-*.log, already filtered to the lookback window. */
	logEvents: Record<string, unknown>[];
	/** Portfolio id -> that trader's currently-open investments. */
	invoOpenInvestmentsByPortfolio: Map<string, OpenInvestment[]>;
	/** Portfolio id -> that trader's recently-closed investments. */
	invoClosedInvestmentsByPortfolio: Map<string, ClosedInvestment[]>;
	hlUserFills: HyperliquidFill[];
	sinceMs: number;
	windowMs: number;
}

export interface ReconcileReport {
	windowHours: number;
	checkedAt: string;
	portfoliosChecked: number;
	fillsChecked: number;
	issueCount: number;
	actionableIssueCount: number;
	issues: Record<string, unknown>[];
}

/**
 * Pure correlation logic, no I/O: cross-references our own logs against two
 * sources this daemon's live reconciler never consults (Invo's isOpen:false
 * closed-investment history, and Hyperliquid's own userFills) to classify
 * discrepancies. Extracted from cli/reconcile.ts so the same joins can back
 * a UI history view, not just the CLI audit.
 */
export function buildReconcileReport(args: ReconcileReportArgs): ReconcileReport {
	const { state, ignored, logEvents, invoOpenInvestmentsByPortfolio, invoClosedInvestmentsByPortfolio, hlUserFills, sinceMs, windowMs } = args;

	const eventsByBaseId = new Map<string, Record<string, unknown>[]>();
	for (const e of logEvents) {
		if (typeof e.baseId !== 'string') continue;
		const list = eventsByBaseId.get(e.baseId) ?? [];
		list.push(e);
		eventsByBaseId.set(e.baseId, list);
	}

	const issues: Record<string, unknown>[] = [];

	// --- Source 1: HL's own fill history, independent of our logs ---
	const fillsByOid = new Map<number, HyperliquidFill>(hlUserFills.map((f) => [f.oid, f]));
	const loggedOids = new Set<number>();
	for (const e of logEvents) {
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
	const portfolioIds = new Set([...invoOpenInvestmentsByPortfolio.keys(), ...invoClosedInvestmentsByPortfolio.keys()]);
	for (const portfolioId of portfolioIds) {
		const openInvestments = invoOpenInvestmentsByPortfolio.get(portfolioId) ?? [];
		const closedInvestments = invoClosedInvestmentsByPortfolio.get(portfolioId) ?? [];

		// Open-side: every currently open investment should be tracked, ignored, or an explained conflict.
		for (const inv of openInvestments) {
			const tracked = !!state[inv.baseId];
			const isIgnored = !!ignored[inv.baseId];
			const baseEventTypes = new Set((eventsByBaseId.get(inv.baseId) ?? []).map((e) => e.type));
			const hasConflictLog = baseEventTypes.has('existing_position_conflict');
			// Deliberately temporary (stale-entry-policy.ts) - never written to
			// IgnoredTradesMap by design, since it's re-evaluated fresh every
			// cycle, so it can't show up as `isIgnored` above; still a fully
			// explained, intentional non-action, not an unexplained gap.
			const hasFreshProfitSkipLog = baseEventTypes.has('fresh_entry_profit_skip');
			if (tracked || isIgnored || hasConflictLog || hasFreshProfitSkipLog) continue;
			issues.push({
				type: 'unexplained_untracked_open',
				baseId: inv.baseId,
				coin: inv.ticker,
				trader: inv.owner?.username,
				createdAt: inv.createdAt,
				detail: 'open on trader side, not tracked, not ignored, no conflict log explains it',
			});
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
			const manualCloseDetectedEvent = baseEvents.find((e) => e.type === 'manual_close_detected');

			if (!closeEvent && manualCloseDetectedEvent) {
				// openOrAdjust's own live-position resync check (position-sync.ts)
				// found the real HL position already gone, on a cycle before this
				// daemon's own close-detection loop ever ran for it - same
				// externally-closed fact as the branch below, just caught via a
				// different code path, so it's not a real missed close.
				issues.push({
					type: 'position_closed_externally',
					severity: 'warn',
					baseId: inv.baseId,
					coin: inv.ticker,
					trader: inv.owner?.username,
					detail: "detected via openOrAdjust's own live-position resync check (manual_close_detected), before this daemon's trader-side close-detection loop ran - not a missed close",
					detectedAt: manualCloseDetectedEvent.ts,
				});
				continue;
			}
			if (!closeEvent && skipCloseEvent) {
				// Two different explanations produce this same signature
				// (tracked it, later found nothing real to close) - distinguish
				// them by checking whether the original "opened" event's own
				// hlResult shows a real fill.
				const openedEvent = baseEvents.find((e) => e.type === 'opened' || e.type === 'auto_adopted');
				const openedStatuses = (openedEvent as any)?.hlResult?.response?.data?.statuses;
				const openedReallyFilled = Array.isArray(openedStatuses) && openedStatuses.some((s: any) => s?.filled);

				if (openedReallyFilled) {
					// The open genuinely filled real money on HL, but this
					// daemon has no `closed` event for it anywhere - something
					// else placed a real closing order on this wallet using
					// this same agent key, entirely outside this daemon. Look
					// up the actual closing fill on HL's own record for detail.
					const openedAtMs = Date.parse((openedEvent as any).ts);
					const closingFill = hlUserFills.find(
						(f) => f.coin === inv.ticker && f.time > openedAtMs && /close/i.test(f.dir),
					);
					issues.push({
						type: 'position_closed_externally',
						severity: 'warn',
						baseId: inv.baseId,
						coin: inv.ticker,
						trader: inv.owner?.username,
						detail:
							"the open genuinely filled on HL, but no close from this daemon exists anywhere in the logs - something else placed a real closing order on this wallet/agent key without this daemon's involvement (e.g. Invo's own official Mimic feature, if also separately enabled on this trader through the app itself)",
						closingFill: closingFill
							? {
									time: new Date(closingFill.time).toISOString(),
									dir: closingFill.dir,
									oid: closingFill.oid,
									closedPnl: closingFill.closedPnl,
								}
							: null,
					});
				} else {
					// Explained: we tried to close and found no real HL
					// position - the original "opened" never actually filled.
					// Not a missed close, but still worth surfacing since it
					// means the open silently failed at some point.
					issues.push({
						type: 'open_never_filled',
						severity: 'info',
						baseId: inv.baseId,
						coin: inv.ticker,
						trader: inv.owner?.username,
						detail:
							'daemon logged "opened" but the order itself never actually filled (no `filled` status on it), and later found no real HL position to close - expected, not a missed close',
					});
				}
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
	return {
		windowHours: windowMs / 3_600_000,
		checkedAt: new Date().toISOString(),
		portfoliosChecked: portfolioIds.size,
		fillsChecked: loggedOids.size,
		issueCount: issues.length,
		actionableIssueCount: actionableIssues.length,
		issues,
	};
}
