import { readLogEvents } from "./readLogs.js";

const RECENT_ERROR_WINDOW_MS = 2 * 60 * 60 * 1000;
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

export interface RecentError {
	ts: string;
	type: string;
	source?: string;
	message?: string;
}

export interface RecentActivityEntry {
	ts: string;
	type: string;
	coin?: string;
	trader?: string;
}

export function readLatestCycleStatus(): {
	cycle: CycleStatus;
	recentErrors: RecentError[];
	recentActivity: RecentActivityEntry[];
} {
	const since = Date.now() - RECENT_ERROR_WINDOW_MS;
	const events = readLogEvents(since);

	let latestCycleEvent: Record<string, unknown> | null = null;
	let latestComplete: Record<string, unknown> | null = null;
	const recentErrors: RecentError[] = [];
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

		if (type === "error" || type === "fatal") {
			recentErrors.push({
				ts,
				type,
				source: e.source as string | undefined,
				message: (e.message as string | undefined) ?? undefined,
			});
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

	recentErrors.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
	recentActivity.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

	return {
		cycle: {
			lastEventType: (latestCycleEvent?.type as string) ?? null,
			lastEventTs: (latestCycleEvent?.ts as string) ?? null,
			lastCompleteTs: (latestComplete?.ts as string) ?? null,
			lastCompleteDurationMs: (latestComplete?.durationMs as number) ?? null,
		},
		recentErrors: recentErrors.slice(0, 20),
		recentActivity: recentActivity.slice(0, 12),
	};
}
