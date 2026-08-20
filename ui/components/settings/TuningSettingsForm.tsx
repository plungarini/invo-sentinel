'use client';

import { saveTuningSettings, type ActionState } from '@/app/settings/actions';
import Button from '@/components/shared/Button';
import type { TuningFormValues } from '@/server/daemon/settings';
import { useActionState, useRef, useState } from 'react';
import Field from './Field';
import ToggleRow from './ToggleRow';
import { useAutoSaveForm } from './useAutoSaveForm';

const INITIAL_STATE: ActionState = { ok: false };

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">{children}</p>;
}

export default function TuningSettingsForm({ defaultValues }: { defaultValues: TuningFormValues }) {
	const [state, formAction, pending] = useActionState(saveTuningSettings, INITIAL_STATE);
	const [maxAgeEnabled, setMaxAgeEnabled] = useState(defaultValues.staleEntryMaxAgeEnabled);
	const [maxProfitEnabled, setMaxProfitEnabled] = useState(defaultValues.staleEntryMaxProfitEnabled);
	const formRef = useRef<HTMLFormElement>(null);
	const autoSave = useAutoSaveForm(formRef, { pending });

	return (
		<form ref={formRef} action={formAction} className="flex flex-col gap-6" onChange={autoSave.onChange} onBlur={autoSave.onBlur}>
			<div className="flex flex-col gap-3">
				<SectionLabel>Risk band</SectionLabel>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						label="Min margin %"
						name="minMarginPct"
						defaultValue={defaultValues.minMarginPct}
						hint="Never risk less than this % of your equity per trade."
					/>
					<Field
						label="Max margin %"
						name="maxMarginPct"
						defaultValue={defaultValues.maxMarginPct}
						hint="Never risk more than this %, no matter what the trader did."
					/>
					<Field
						label="Max leverage"
						name="maxLeverage"
						defaultValue={defaultValues.maxLeverage}
						placeholder="blank = no cap"
						hint="Leverage is capped here, not rejected."
					/>
				</div>
			</div>

			<div className="flex flex-col gap-4 border-t border-border pt-5">
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
				{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
				{state.ok && (
					<p className="text-[13px] text-profit">
						Saved. Takes effect on the next reconcile cycle - a margin band change resizes open positions with real
						orders on the exchange, not just new trades.
					</p>
				)}
				<Button type="submit" variant="primary" disabled={pending} className="self-start">
					{pending ? 'Saving...' : 'Save settings'}
				</Button>
			</div>
		</form>
	);
}
