import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger.js';

const UI_PORT = 4400;
const RESTART_DELAY_MS = 3_000;
// A child that dies almost immediately is usually a fast fail that a 3s retry
// just spams the log with (port still held by a not-yet-dead previous UI after
// an update, Node missing, a bad build) - back off much harder for those.
const FAST_FAIL_MS = 5_000;
const FAST_FAIL_RESTART_DELAY_MS = 15_000;
const BROWSER_OPEN_DELAY_MS = 3_000;
const STOP_TIMEOUT_MS = 3_000;

export interface UiSupervisor {
	/** Kills the UI child (if running) and resolves once it's actually gone (or after a bounded timeout) - a caller about to swap `bin/ui/`'s files or exit the whole process needs the child truly stopped first, not just a kill signal sent. */
	stop(): Promise<void>;
}

const NOOP_SUPERVISOR: UiSupervisor = { stop: async () => {} };

function openBrowser(url: string): void {
	// One codepath, not three: `child_process.spawn`'s own `windowsHide`
	// already suppresses the console window on Windows, and the exact same
	// spawn() call runs on Linux/macOS - no OS-specific wrapper script needed
	// for this either.
	const [cmd, args] =
		process.platform === 'win32'
			? ['cmd', ['/c', 'start', '""', url]]
			: process.platform === 'darwin'
				? ['open', [url]]
				: ['xdg-open', [url]];
	try {
		spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
	} catch {
		// best-effort only - failing to auto-open a browser is never fatal
	}
}

/**
 * Runs the packaged dashboard UI (`<rootDir>/ui/server.js`, present only in
 * a compiled release) as a supervised child process - restarted on crash,
 * killed on daemon shutdown - entirely via Node's own `child_process`
 * rather than OS-specific process-management (a hidden window trick on
 * Windows, a backgrounded loop in bash): `spawn(..., { windowsHide: true })`
 * already runs invisibly on Windows, and the identical code runs unchanged
 * on Linux/macOS, so there's exactly one supervision implementation instead
 * of three (batch, bash, PowerShell) - `start.bat`/`start.sh` no longer
 * manage the UI process at all, just the daemon exe itself.
 */
export function startUiSupervisor(opts: { rootDir: string; log: Logger }): UiSupervisor {
	const { rootDir, log } = opts;
	const uiDir = join(rootDir, 'ui');
	if (!existsSync(join(uiDir, 'server.js'))) return NOOP_SUPERVISOR;

	const logsDir = join(rootDir, 'logs');
	mkdirSync(logsDir, { recursive: true });
	// A plain fd via openSync, not fs.createWriteStream - spawn()'s stdio
	// array requires an already-open fd/stream at call time, and a
	// WriteStream's fd isn't ready until its own async 'open' event fires,
	// which races the very next spawn() call (confirmed live: throws
	// ERR_INVALID_ARG_VALUE the first time, every time).
	const logFd = openSync(join(logsDir, 'ui.log'), 'a');

	let stopping = false;
	let child: ChildProcess | null = null;
	let restartTimer: NodeJS.Timeout | null = null;
	let browserOpened = false;
	let spawnedAt = 0;

	function spawnChild(): void {
		spawnedAt = Date.now();
		child = spawn('node', ['server.js'], {
			cwd: uiDir,
			env: { ...process.env, PORT: String(UI_PORT) },
			stdio: ['ignore', logFd, logFd],
			windowsHide: true,
		});

		child.on('error', (err) => {
			log({ type: 'error', source: 'ui_supervisor', message: `dashboard UI needs Node.js installed: ${err.message}` });
			child = null;
		});

		child.on('exit', (code, signal) => {
			child = null;
			if (stopping) return;
			log({ type: 'ui_crashed', code, signal });
			const delay = Date.now() - spawnedAt < FAST_FAIL_MS ? FAST_FAIL_RESTART_DELAY_MS : RESTART_DELAY_MS;
			restartTimer = setTimeout(spawnChild, delay);
		});

		if (!browserOpened) {
			browserOpened = true;
			setTimeout(() => openBrowser(`http://localhost:${UI_PORT}`), BROWSER_OPEN_DELAY_MS);
		}
	}

	spawnChild();

	return {
		stop(): Promise<void> {
			stopping = true;
			if (restartTimer) clearTimeout(restartTimer);
			const current = child;
			if (!current) {
				closeSync(logFd);
				return Promise.resolve();
			}
			return new Promise((resolve) => {
				let done = false;
				const finish = () => {
					if (done) return;
					done = true;
					clearTimeout(sigkillTimer);
					clearTimeout(hardCap);
					closeSync(logFd);
					resolve();
				};
				current.once('exit', finish);
				current.kill(); // SIGTERM
				// If it hasn't exited by the timeout, SIGKILL it - a still-alive
				// child keeps port 4400 held, which is exactly what makes the
				// next daemon's UI spawn fail with EADDRINUSE after an update.
				const sigkillTimer = setTimeout(() => current.kill('SIGKILL'), STOP_TIMEOUT_MS);
				const hardCap = setTimeout(finish, STOP_TIMEOUT_MS + 1_000);
			});
		},
	};
}
