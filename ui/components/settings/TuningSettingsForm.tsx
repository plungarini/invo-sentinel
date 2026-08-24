'use client';

import { saveTuningSettings, type ActionState } from '@/app/settings/actions';
import type { TuningFormValues } from '@/server/daemon/settings';
import { useActionState, useRef } from 'react';
import Field from './Field';
import { useAutoSaveForm } from './useAutoSaveForm';

const INITIAL_STATE: ActionState = { ok: false };

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">{children}</p>;
}

export default function TuningSettingsForm({ defaultValues }: { defaultValues: TuningFormValues }) {
	const [state, formAction, pending] = useActionState(saveTuningSettings, INITIAL_STATE);
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

			{(state.error || state.ok) && (
				<div className="flex flex-col gap-3 border-t border-border pt-5">
					{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
					{state.ok && (
						<p className="text-[13px] text-profit">
							Saved. Takes effect on the next reconcile cycle - a margin band change resizes open positions with real
							orders on the exchange, not just new trades.
						</p>
					)}
				</div>
			)}
		</form>
	);
}
