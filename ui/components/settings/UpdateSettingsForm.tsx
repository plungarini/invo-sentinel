'use client';

import { saveUpdateSettings, type ActionState } from '@/app/settings/actions';
import type { UpdateFormValues } from '@/server/daemon/settings';
import { useActionState, useRef, useState } from 'react';
import ToggleRow from './ToggleRow';
import { useAutoSaveForm } from './useAutoSaveForm';

const INITIAL_STATE: ActionState = { ok: false };

export default function UpdateSettingsForm({ defaultValues }: { defaultValues: UpdateFormValues }) {
	const [state, formAction, pending] = useActionState(saveUpdateSettings, INITIAL_STATE);
	const [autoUpdate, setAutoUpdate] = useState(defaultValues.autoUpdate);
	const formRef = useRef<HTMLFormElement>(null);
	const autoSave = useAutoSaveForm(formRef, { pending });

	return (
		<form
			ref={formRef}
			action={formAction}
			className="flex flex-col gap-5"
			onChange={autoSave.onChange}
			onBlur={autoSave.onBlur}
		>
			<ToggleRow
				label="Auto-update"
				hint="Checks github.com/plungarini/invo-sentinel every ~30min. A new release is downloaded, checksum-verified, and installed on the next restart."
				name="autoUpdate"
				checked={autoUpdate}
				onChange={setAutoUpdate}
			/>

			{(state.error || state.ok) && (
				<div className="flex flex-col gap-3 border-t border-border pt-5">
					{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
					{state.ok && <p className="text-[13px] text-profit">Saved.</p>}
				</div>
			)}
		</form>
	);
}
