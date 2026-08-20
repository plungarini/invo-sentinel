import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './logger.js';

const UI_PORT = 4400;
const RESTART_DELAY_MS = 3_000;
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

	function spawnChild(): void {
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
			restartTimer = setTimeout(spawnChild, RESTART_DELAY_MS);
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
				const finish = () => {
					closeSync(logFd);
					resolve();
				};
				const timer = setTimeout(finish, STOP_TIMEOUT_MS);
				current.once('exit', () => {
					clearTimeout(timer);
					finish();
				});
				current.kill();
			});
		},
	};
}
