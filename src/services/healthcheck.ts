import type { Logger } from './logger.js';

const DEFAULT_TIMEOUT_MS = 10_000;

async function send(url: string, suffix: string, timeoutMs: number): Promise<void> {
	const target = suffix ? `${url}/${suffix}` : url;
	await fetch(target, { method: 'GET', signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Optional integration with an external "dead man's switch" monitor (e.g.
 * healthchecks.io) - set HEALTHCHECK_PING_URL to enable, leave unset to
 * disable entirely. All three fire-and-forget variants never throw and are
 * never awaited by callers: a slow or unreachable monitor must never delay
 * or stall actual trading logic. `/start` + success/fail (rather than a
 * single ping) means the monitor can show run duration per cycle and alert
 * on an actual failure immediately, instead of waiting for a missed-ping
 * timeout.
 */
export function pingStart(url: string | undefined, log: Logger): void {
	if (!url) return;
	send(url, 'start', DEFAULT_TIMEOUT_MS).catch((e: any) => {
		log({ type: 'error', source: 'healthcheck_ping', suffix: 'start', message: e.message });
	});
}

export function pingSuccess(url: string | undefined, log: Logger): void {
	if (!url) return;
	send(url, '', DEFAULT_TIMEOUT_MS).catch((e: any) => {
		log({ type: 'error', source: 'healthcheck_ping', suffix: 'success', message: e.message });
	});
}

export function pingFail(url: string | undefined, log: Logger): void {
	if (!url) return;
	send(url, 'fail', DEFAULT_TIMEOUT_MS).catch((e: any) => {
		log({ type: 'error', source: 'healthcheck_ping', suffix: 'fail', message: e.message });
	});
}

/**
 * Only for the fatal crash handlers, where the process exits immediately
 * after - a fire-and-forget ping would very likely get killed mid-flight
 * and never actually leave the machine, defeating the point of an
 * immediate failure alert right when it matters most. Awaited with a short
 * bounded timeout so a dead network can't hang process shutdown.
 */
export async function pingFailAwaited(url: string | undefined, timeoutMs = 3_000): Promise<void> {
	if (!url) return;
	try {
		await send(url, 'fail', timeoutMs);
	} catch {
		// Best-effort only - the process is exiting regardless.
	}
}
