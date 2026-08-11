import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGS_DIR } from "./paths.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same glob + parse pattern as reconcile.ts's loadLogEvents. Defaults to today's + yesterday's files, cheap enough for a live status widget. */
export function readLogEvents(sinceMs?: number): Record<string, unknown>[] {
	const since = sinceMs ?? Date.now() - 2 * DAY_MS;

	let files: string[];
	try {
		files = readdirSync(LOGS_DIR).filter((f) => f.startsWith("auto-copy-") && f.endsWith(".log"));
	} catch {
		return [];
	}

	const events: Record<string, unknown>[] = [];
	for (const f of files) {
		let raw: string;
		try {
			raw = readFileSync(join(LOGS_DIR, f), "utf8");
		} catch {
			continue;
		}
		for (const line of raw.split("\n")) {
			if (!line.trim()) continue;
			let obj: Record<string, unknown>;
			try {
				obj = JSON.parse(line);
			} catch {
				continue;
			}
			const ts = Date.parse(obj.ts as string);
			if (Number.isFinite(ts) && ts >= since) events.push(obj);
		}
	}
	return events;
}
