import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // re-check retention/size at most once an hour

export interface Logger {
	(obj: Record<string, unknown>): void;
}

export interface LoggerOptions {
	name: string;
	dir: string;
	retentionHours: number;
	maxTotalMb: number;
	/** Skip the raw JSON-line mirror to stdout (file logging is unaffected) - for when something else owns the terminal, e.g. `console-tui.ts`'s redraw loop, which would otherwise be interleaved with/scrolled away by raw log lines. */
	quiet?: boolean;
}

/**
 * Rotating, retention-bounded JSON-line logger. Writes one file per day
 * (`<name>-YYYY-MM-DD.log`) and mirrors every line to stdout. Retention is
 * enforced two ways, both active: files older than `retentionHours` are
 * deleted, and the directory as a whole is capped at `maxTotalMb` (oldest
 * files evicted first); so a burst of activity can't fill the disk even
 * within the retention window.
 */
export function createLogger({ name, dir, retentionHours, maxTotalMb, quiet = false }: LoggerOptions): Logger {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

	const retentionMs = retentionHours * 60 * 60 * 1000;
	const maxTotalBytes = maxTotalMb * 1024 * 1024;
	let lastCleanup = 0;

	function currentFile(): string {
		const day = new Date().toISOString().slice(0, 10);
		return join(dir, `${name}-${day}.log`);
	}

	function cleanup() {
		const now = Date.now();
		if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
		lastCleanup = now;

		try {
			const files = readdirSync(dir)
				.filter((f) => f.startsWith(`${name}-`) && f.endsWith('.log'))
				.map((f) => {
					const full = join(dir, f);
					const st = statSync(full);
					return { full, mtimeMs: st.mtimeMs, size: st.size };
				});

			for (const f of files) {
				if (now - f.mtimeMs > retentionMs) {
					try {
						unlinkSync(f.full);
					} catch {
						/* already gone */
					}
				}
			}

			const remaining = files.filter((f) => now - f.mtimeMs <= retentionMs);
			remaining.sort((a, b) => a.mtimeMs - b.mtimeMs);
			let total = remaining.reduce((sum, f) => sum + f.size, 0);
			for (const f of remaining) {
				if (total <= maxTotalBytes) break;
				try {
					unlinkSync(f.full);
					total -= f.size;
				} catch {
					/* already gone */
				}
			}
		} catch {
			// Cleanup is best-effort; never let it take down the process.
		}
	}

	return function log(obj: Record<string, unknown>) {
		const line = JSON.stringify({ ts: new Date().toISOString(), ...obj });
		if (!quiet) console.log(line);
		try {
			appendFileSync(currentFile(), line + '\n');
		} catch {
			// Disk hiccup; keep running, stdout already has it.
		}
		cleanup();
	};
}
