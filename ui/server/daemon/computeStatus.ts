import { readLogEvents } from "./readLogs.js";

const RECENT_ACTIVITY_WINDOW_MS = 2 * 60 * 60 * 1000;
const CYCLE_EVENT_TYPES = new Set(["cycle_start", "cycle_checkpoint", "cycle_complete"]);
const ACTIVITY_EVENT_TYPES = new Set([
	"opened",
	"increased",
	"reduced",
	"closed",
	"auto_adopted",
	"manual_close_detected",
	"manual_direction_change_detected",
	"existing_position_conflict",
	"stale_entry_ignored",
]);

export interface CycleStatus {
	lastEventType: string | null;
	lastEventTs: string | null;
	lastCompleteTs: string | null;
	lastCompleteDurationMs: number | null;
}

const MAX_POLL_DURATION_SAMPLES = 200;

/**
 * Rolling average over the most recent (up to 200) real reconcile cycles -
 * reads straight from the daemon's own `cycle_complete` log lines rather
 * than a separate store, since those already carry `durationMs` for every
 * cycle and persist across restarts the same way. Skipped cycles (a
 * transient rate-limit no-op, see reconciler.ts) are excluded - they measure
 * an early-return, not real poll work, and would drag the average down
 * without reflecting an actually faster daemon.
 */
export function readAvgPollDuration(): { avgMs: number | null; sampleCount: number } {
	const durations = readLogEvents(0)
		.filter((e) => e.type === "cycle_complete" && !e.skipped && typeof e.durationMs === "number" && typeof e.ts === "string")
		.sort((a, b) => Date.parse(b.ts as string) - Date.parse(a.ts as string))
		.slice(0, MAX_POLL_DURATION_SAMPLES)
		.map((e) => e.durationMs as number);

	if (durations.length === 0) return { avgMs: null, sampleCount: 0 };
	return { avgMs: durations.reduce((sum, d) => sum + d, 0) / durations.length, sampleCount: durations.length };
}

export interface RecentActivityEntry {
	ts: string;
	type: string;
	coin?: string;
	trader?: string;
}

export function readLatestCycleStatus(): {
	cycle: CycleStatus;
	recentActivity: RecentActivityEntry[];
} {
	const since = Date.now() - RECENT_ACTIVITY_WINDOW_MS;
	const events = readLogEvents(since);

	let latestCycleEvent: Record<string, unknown> | null = null;
	let latestComplete: Record<string, unknown> | null = null;
	const recentActivity: RecentActivityEntry[] = [];

	for (const e of events) {
		const type = e.type as string | undefined;
		const ts = e.ts as string | undefined;
		if (!type || !ts) continue;

		if (CYCLE_EVENT_TYPES.has(type)) {
			if (!latestCycleEvent || Date.parse(ts) >= Date.parse(latestCycleEvent.ts as string)) {
				latestCycleEvent = e;
			}
			if (type === "cycle_complete" && (!latestComplete || Date.parse(ts) >= Date.parse(latestComplete.ts as string))) {
				latestComplete = e;
			}
		}

		if (ACTIVITY_EVENT_TYPES.has(type)) {
			recentActivity.push({
				ts,
				type,
				coin: e.coin as string | undefined,
				trader: e.trader as string | undefined,
			});
		}
	}

	recentActivity.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

	return {
		cycle: {
			lastEventType: (latestCycleEvent?.type as string) ?? null,
			lastEventTs: (latestCycleEvent?.ts as string) ?? null,
			lastCompleteTs: (latestComplete?.ts as string) ?? null,
			lastCompleteDurationMs: (latestComplete?.durationMs as number) ?? null,
		},
		recentActivity: recentActivity.slice(0, 12),
	};
}
