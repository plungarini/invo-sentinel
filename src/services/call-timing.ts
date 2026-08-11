// get_users_followed_portfolios alone routinely runs ~1-1.2s (confirmed via
// dry-run 2026-08-11) - that's this endpoint's ordinary baseline, not a
// problem worth a log line every single cycle. The periodic bump under
// investigation adds several EXTRA seconds on top of any call's own
// baseline, so the threshold sits well above normal single-call latency.
const SLOW_CALL_THRESHOLD_MS = 3000;

export interface SlowCallRecord {
	source: 'invo' | 'hyperliquid';
	label: string;
	durationMs: number;
	ts: string;
}

/**
 * Diagnostic-only: records outbound API calls slower than the threshold so
 * a periodic latency pattern (e.g. a recurring multi-second bump every ~30
 * minutes, see INCIDENT_LOG.md 2026-08-11) can be pinned to a specific
 * endpoint instead of just a slow cycle overall. Buffered rather than
 * logged inline so it doesn't spam a log line per call - the reconciler
 * drains and logs only what's actually slow, once per cycle.
 */
export class SlowCallTracker {
	private records: SlowCallRecord[] = [];

	constructor(private source: SlowCallRecord['source']) {}

	async track<T>(label: string, fn: () => Promise<T>): Promise<T> {
		const startedAt = Date.now();
		try {
			return await fn();
		} finally {
			const durationMs = Date.now() - startedAt;
			if (durationMs >= SLOW_CALL_THRESHOLD_MS) {
				this.records.push({ source: this.source, label, durationMs, ts: new Date().toISOString() });
			}
		}
	}

	drain(): SlowCallRecord[] {
		const drained = this.records;
		this.records = [];
		return drained;
	}
}
