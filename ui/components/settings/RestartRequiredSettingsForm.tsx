'use client';

import { saveRestartRequiredSettings, type ActionState } from '@/app/settings/actions';
import type { TuningFormValues } from '@/server/daemon/settings';
import { useActionState, useRef, useState } from 'react';
import ConfirmDialog from '../shared/ConfirmDialog';
import Button from '../shared/Button';
import Field from './Field';
import ToggleRow from './ToggleRow';

const INITIAL_STATE: ActionState = { ok: false };

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">{children}</p>;
}

/**
 * Every field here is only ever read once at daemon boot (see `auto-copy.ts`
 * - `config`, the logger, and `PositionSync`'s constructor are all built from
 * the boot-time snapshot, never re-read mid-run), unlike the risk band in
 * `TuningSettingsForm`. Saving alone would silently do nothing until the next
 * incidental restart - so this form saves explicitly (no autosave) behind a
 * confirmation dialog, and the save itself also flips `restartRequested`
 * (see `saveRestartRequiredSettings`), which `auto-copy.ts`'s
 * `maybeApplyRestart` picks up right after its next reconcile cycle
 * completes and turns into an actual clean process exit.
 */
export default function RestartRequiredSettingsForm({ defaultValues }: { defaultValues: TuningFormValues }) {
	const [state, formAction, pending] = useActionState(saveRestartRequiredSettings, INITIAL_STATE);
	const [maxAgeEnabled, setMaxAgeEnabled] = useState(defaultValues.staleEntryMaxAgeEnabled);
	const [maxProfitEnabled, setMaxProfitEnabled] = useState(defaultValues.staleEntryMaxProfitEnabled);
	const [confirming, setConfirming] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	return (
		<>
			<form ref={formRef} action={formAction} className="flex flex-col gap-6">
				<div className="flex flex-col gap-4">
					<SectionLabel>Stale entries</SectionLabel>

					<div className="flex flex-col gap-3">
						<ToggleRow
							label="Max age guardrail"
							hint="Past this age, a fresh entry is permanently skipped instead of opened."
							name="staleEntryMaxAgeEnabled"
							checked={maxAgeEnabled}
							onChange={setMaxAgeEnabled}
						/>
						<Field
							label="Max age (minutes)"
							name="staleEntryMaxAgeMinutes"
							defaultValue={defaultValues.staleEntryMaxAgeMinutes}
						/>
					</div>

					<div className="flex flex-col gap-3 border-t border-border pt-4">
						<ToggleRow
							label="Max profit guardrail"
							hint="Still within the age window but already up this much % is skipped for one cycle."
							name="staleEntryMaxProfitEnabled"
							checked={maxProfitEnabled}
							onChange={setMaxProfitEnabled}
						/>
						<Field
							label="Max profit %"
							name="staleEntryMaxProfitPct"
							defaultValue={defaultValues.staleEntryMaxProfitPct}
						/>
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t border-border pt-5">
					<SectionLabel>Operations</SectionLabel>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field label="Poll interval (ms)" name="pollIntervalMs" defaultValue={defaultValues.pollIntervalMs} />
						<Field
							label="Log retention (hours)"
							name="logRetentionHours"
							defaultValue={defaultValues.logRetentionHours}
						/>
						<Field label="Log max total size (MB)" name="logMaxTotalMb" defaultValue={defaultValues.logMaxTotalMb} />
						<Field
							label="Healthcheck ping URL"
							name="healthcheckPingUrl"
							defaultValue={defaultValues.healthcheckPingUrl}
							placeholder="optional, e.g. healthchecks.io"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t border-border pt-5">
					<p className="text-[12px] text-text-faint">
						These settings only take effect after the daemon restarts - saving here restarts it for you.
					</p>
					<div>
						<Button type="button" variant="warning" disabled={pending} onClick={() => setConfirming(true)}>
							Save and restart
						</Button>
					</div>
					{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
					{state.ok && (
						<p className="text-[13px] text-profit">
							Saved. The daemon is restarting to apply these - this page will reload automatically once it&apos;s
							back (usually a few seconds); open positions on the exchange are unaffected.
						</p>
					)}
				</div>
			</form>

			{confirming && (
				<ConfirmDialog
					title="Restart the daemon?"
					message="This saves these settings and restarts the daemon process to apply them. Trading pauses for a few seconds while it comes back up - open positions on the exchange are not affected."
					confirmLabel="Save and restart"
					confirmVariant="warning"
					onCancel={() => setConfirming(false)}
					onConfirm={() => {
						setConfirming(false);
						formRef.current?.requestSubmit();
					}}
				/>
			)}
		</>
	);
}
