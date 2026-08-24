'use client';

import { applyUpdateNow, checkForUpdatesNow, type ActionState } from '@/app/settings/actions';
import Button from '@/components/shared/Button';
import { useActionState } from 'react';

const INITIAL_STATE: ActionState = { ok: false };

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

			{applyState.ok && (
				<p className="text-[13px] text-badge-amber">
					Update requested - the daemon will restart to apply it. This page will reload automatically once it&apos;s
					back (usually a few seconds; check the daemon directly if it takes longer than a couple of minutes).
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
