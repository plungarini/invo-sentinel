'use client';

import { applyUpdateNow, checkForUpdatesNow, type ActionState } from '@/app/settings/actions';
import Button from '@/components/shared/Button';
import { useActionState, useEffect, useState } from 'react';

const INITIAL_STATE: ActionState = { ok: false };
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Applying an update kills and restarts the UI's own Node process for the
 * file swap (see auto-copy.ts's process.exit(42) / start.bat/start.sh) - a
 * tab left open across that window gets 502s while it's down, then a React
 * hydration error once it's back up serving a different build's JS chunks
 * to a page instance that already loaded the old ones. A full reload once
 * the server is confirmed responsive again sidesteps both: no stale chunks,
 * no manual refresh needed.
 */
function useRestartWatcher(active: boolean) {
	const [timedOut, setTimedOut] = useState(false);

	useEffect(() => {
		if (!active) return;
		const startedAt = Date.now();
		const interval = setInterval(async () => {
			if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
				setTimedOut(true);
				clearInterval(interval);
				return;
			}
			try {
				const res = await fetch('/api/status', { cache: 'no-store' });
				if (res.ok) window.location.reload();
			} catch {
				// Expected while the process is down/mid-restart - keep polling.
			}
		}, POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [active]);

	return timedOut;
}

export default function UpdateCheckCard({
	currentVersion,
	latestVersionSeen,
	lastCheckedAt,
}: {
	currentVersion: string;
	latestVersionSeen: string | null;
	lastCheckedAt: string | null;
}) {
	const [checkState, checkAction, checkPending] = useActionState(checkForUpdatesNow, INITIAL_STATE);
	const [applyState, applyAction, applyPending] = useActionState(applyUpdateNow, INITIAL_STATE);
	const restartTimedOut = useRestartWatcher(applyState.ok);

	const updateAvailable = !!latestVersionSeen && latestVersionSeen !== currentVersion;

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1 text-[13px]">
				<p className="text-text-secondary">
					Running <span className="font-mono text-text-primary">v{currentVersion}</span>
					{updateAvailable && <span className="text-loss"> - v{latestVersionSeen} is available</span>}
				</p>
				<p className="text-text-faint">
					{lastCheckedAt ? `Last checked ${new Date(lastCheckedAt).toLocaleString()}` : 'Not checked yet.'}
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<form action={checkAction}>
					<Button type="submit" variant="secondary" className="border border-border" disabled={checkPending}>
						{checkPending ? 'Requesting...' : 'Check for updates'}
					</Button>
				</form>
				{updateAvailable && (
					<form action={applyAction}>
						<Button type="submit" variant="primary" disabled={applyPending}>
							{applyPending ? 'Requesting...' : `Update to v${latestVersionSeen} now`}
						</Button>
					</form>
				)}
			</div>

			{applyState.ok && !restartTimedOut && (
				<p className="text-[13px] text-badge-amber">
					Update requested - the daemon will restart to apply it. This page will reload automatically once it&apos;s
					back (usually a few seconds).
				</p>
			)}
			{applyState.ok && restartTimedOut && (
				<p className="text-[13px] text-loss">
					Still waiting on the daemon to come back after {Math.round(POLL_TIMEOUT_MS / 60000)} minutes - check it
					directly (e.g. SSH into the Pi) rather than continuing to wait here.
				</p>
			)}
			{checkState.ok && (
				<p className="text-[13px] text-profit">
					Requested - picked up on the daemon&apos;s next cycle. Refresh this page in a bit to see the result.
				</p>
			)}
			{(checkState.error || applyState.error) && (
				<p className="text-[13px] text-loss">{checkState.error || applyState.error}</p>
			)}
		</div>
	);
}
