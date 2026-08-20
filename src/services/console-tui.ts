import { existsSync, readFileSync } from 'fs';
import http from 'http';
import { join } from 'path';

/**
 * Minimal, dependency-free terminal dashboard for the packaged/one-click
 * daemon, replacing a raw scroll of JSON log lines with an ASCII title, a
 * one-line health summary (daemon status + a clickable dashboard-UI URL -
 * previously given nowhere at all), and the last N events in
 * plain-English underneath. No TUI framework (blessed/ink/etc.) - a extra
 * dependency there is a extra thing that has to survive `bun build
 * --compile`, and this doesn't need a framework's complexity (no keyboard
 * navigation, no interactive widgets - just render-on-event). Full
 * clear-and-redraw each tick rather than fine-grained cursor addressing -
 * simpler to get right, and cheap enough at this event rate (a few lines
 * per poll cycle, not a hot loop).
 */

const COLORS = {
	reset: '\x1b[0m',
	dim: '\x1b[2m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
};

// Generated once via `npx figlet "Invo Sentinel" -f Small` and hardcoded -
// not worth a runtime figlet dependency for one fixed string.
const BANNER = [
	'  ___               ___          _   _          _ ',
	' |_ _|_ ___ _____  / __| ___ _ _| |_(_)_ _  ___| |',
	'  | || \' \\ V / _ \\ \\__ \\/ -_) \' \\  _| | \' \\/ -_) |',
	' |___|_||_\\_/\\___/ |___/\\___|_||_\\__|_|_||_\\___|_|',
].join('\n');

const MAX_LOG_LINES = 14;
const UI_PROBE_INTERVAL_MS = 3_000;
const UI_PROBE_TIMEOUT_MS = 800;

export interface ConsoleTui {
	onLog(obj: Record<string, unknown>): void;
	stop(): void;
}

/** Only when something is actually there to draw to, and the user hasn't opted out - a piped/redirected stdout (CI, `> file.log`, Task Scheduler with no console) must keep getting plain JSON lines instead. */
export function shouldUseConsoleTui(): boolean {
	if (process.env.NO_TUI === '1') return false;
	if (process.argv.includes('--no-tui')) return false;
	return process.stdout.isTTY === true;
}

/** Best-effort default UI port: reads `ui/.env.local`'s PORT= if this is a source checkout that has one, otherwise the documented default (see README's Dashboard UI section). Never throws - a missing/malformed file just falls back. */
function resolveUiPort(rootDir: string): number {
	try {
		const envLocalPath = join(rootDir, 'ui', '.env.local');
		if (existsSync(envLocalPath)) {
			const match = readFileSync(envLocalPath, 'utf8').match(/^PORT=(\d+)/m);
			if (match) return parseInt(match[1], 10);
		}
	} catch {
		// fall through to default
	}
	return 4400;
}

function probeUiReachable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: UI_PROBE_TIMEOUT_MS }, (res) => {
			res.resume();
			resolve(true);
		});
		req.on('timeout', () => req.destroy());
		req.on('error', () => resolve(false));
		req.setTimeout(UI_PROBE_TIMEOUT_MS, () => {
			req.destroy();
			resolve(false);
		});
	});
}

type DaemonStatus = 'starting' | 'awaiting_configuration' | 'running' | 'error';

/** Hand-picked friendly text for the handful of event types most worth a human sentence; everything else falls back to a generic `type key=value` line rather than needing every event shape enumerated here. */
function friendlyLine(obj: Record<string, unknown>): string | null {
	switch (obj.type) {
		case 'awaiting_configuration':
			return `Waiting for setup - missing: ${Array.isArray(obj.missing) ? obj.missing.join(', ') : '?'}`;
		case 'configuration_complete':
			return 'Configuration loaded - starting up';
		case 'cycle_start':
			return 'Reconcile cycle started';
		case 'cycle_complete':
			return `Reconcile cycle complete${typeof obj.durationMs === 'number' ? ` (${obj.durationMs}ms)` : ''}`;
		case 'fatal':
			return `FATAL: ${String(obj.message ?? 'unknown error')}`;
		case 'risk_band_changed':
			return 'Risk band changed - resizing open positions to match';
		default:
			return null;
	}
}

function genericLine(obj: Record<string, unknown>): string {
	const { ts: _ts, type, ...rest } = obj;
	const parts = Object.entries(rest)
		.filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
		.slice(0, 3)
		.map(([k, v]) => `${k}=${v}`);
	return parts.length > 0 ? `${type} ${parts.join(' ')}` : String(type ?? 'event');
}

function formatLogLine(obj: Record<string, unknown>): string {
	const time = typeof obj.ts === 'string' ? obj.ts.slice(11, 19) : new Date().toISOString().slice(11, 19);
	const message = friendlyLine(obj) ?? genericLine(obj);
	return `${COLORS.dim}[${time}]${COLORS.reset} ${message}`;
}

/**
 * `rootDir` anchors the `ui/.env.local` port lookup - pass the same root
 * `resolveRootDir()` gave the caller, not a hardcoded path (which would be
 * wrong for both the compiled-binary and dev-mode cases in different ways).
 */
export function startConsoleTui(rootDir: string): ConsoleTui {
	const uiPort = resolveUiPort(rootDir);
	const lines: string[] = [];
	let status: DaemonStatus = 'starting';
	let statusDetail = 'Starting up...';
	let uiReachable = false;
	let probing = false;

	function statusLine(): string {
		const dot = status === 'running' ? `${COLORS.green}●` : status === 'error' ? `${COLORS.red}●` : `${COLORS.yellow}●`;
		const label = status === 'running' ? 'Running' : status === 'error' ? 'Error' : status === 'awaiting_configuration' ? 'Awaiting setup' : 'Starting';
		return `  Daemon      ${dot}${COLORS.reset} ${label}${statusDetail ? ` ${COLORS.dim}- ${statusDetail}${COLORS.reset}` : ''}`;
	}

	function uiLine(): string {
		const dot = uiReachable ? `${COLORS.green}●` : `${COLORS.dim}○`;
		const label = uiReachable ? 'Reachable' : 'Not running yet';
		return `  Dashboard   ${dot}${COLORS.reset} ${label} ${COLORS.cyan}http://localhost:${uiPort}${COLORS.reset}`;
	}

	function render() {
		const out: string[] = [];
		out.push(`${COLORS.bold}${BANNER}${COLORS.reset}`);
		out.push('');
		out.push(statusLine());
		out.push(uiLine());
		out.push('');
		out.push(`${COLORS.dim}  Recent activity${COLORS.reset}`);
		out.push(`${COLORS.dim}  ${'─'.repeat(52)}${COLORS.reset}`);
		for (const line of lines) out.push(`  ${line}`);
		out.push('');
		out.push(`${COLORS.dim}  Ctrl+C to stop. See logs/ for the full JSON history.${COLORS.reset}`);
		// Full clear + home, then draw - simpler than fine-grained cursor
		// addressing, cheap at this event rate.
		process.stdout.write('\x1b[2J\x1b[0f' + out.join('\n') + '\n');
	}

	async function refreshUiProbe() {
		if (probing) return;
		probing = true;
		const reachable = await probeUiReachable(uiPort);
		probing = false;
		if (reachable !== uiReachable) {
			uiReachable = reachable;
			render();
		}
	}

	const probeTimer = setInterval(refreshUiProbe, UI_PROBE_INTERVAL_MS);
	refreshUiProbe();
	render();

	return {
		onLog(obj: Record<string, unknown>) {
			if (obj.type === 'awaiting_configuration') {
				status = 'awaiting_configuration';
				statusDetail = '';
			} else if (obj.type === 'configuration_complete' || obj.type === 'cycle_start' || obj.type === 'cycle_complete') {
				status = 'running';
				statusDetail = '';
			} else if (obj.type === 'fatal') {
				status = 'error';
				statusDetail = String(obj.message ?? '');
			}
			lines.push(formatLogLine(obj));
			while (lines.length > MAX_LOG_LINES) lines.shift();
			render();
		},
		stop() {
			clearInterval(probeTimer);
		},
	};
}
