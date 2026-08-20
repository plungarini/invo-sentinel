"use client";

import { useActionState, useRef, useState } from "react";
import Button from "@/components/shared/Button";
import { saveTraderModeSettings, type ActionState } from "@/app/settings/actions";
import type { TraderModeFormValues } from "@/server/daemon/settings";
import Field from "./Field";
import ToggleRow from "./ToggleRow";
import { useAutoSaveForm } from "./useAutoSaveForm";

const INITIAL_STATE: ActionState = { ok: false };

export default function TraderModeSettingsForm({ defaultValues }: { defaultValues: TraderModeFormValues }) {
	const [state, formAction, pending] = useActionState(saveTraderModeSettings, INITIAL_STATE);
	const [enabled, setEnabled] = useState(defaultValues.enabled);
	const [autoShare, setAutoShare] = useState(defaultValues.autoShare);
	const formRef = useRef<HTMLFormElement>(null);
	const autoSave = useAutoSaveForm(formRef, { pending });

	return (
		<form ref={formRef} action={formAction} className="flex flex-col gap-6" onChange={autoSave.onChange} onBlur={autoSave.onBlur}>
			<ToggleRow
				label="Trader mode"
				hint="Mirrors every trade Sentinel opens/adjusts/closes onto an Invo portfolio you own, as a paper-traded trade idea."
				name="enabled"
				checked={enabled}
				onChange={setEnabled}
			/>

			{/* Kept in the DOM (not conditionally rendered) even while hidden, so
			toggling Trader mode off and back on doesn't lose an already-typed
			portfolio ID/caption - only visibility, not form data, follows `enabled`. */}
			<div className={`flex flex-col gap-4 border-t border-border pt-5 ${enabled ? "" : "hidden"}`}>
				<Field
					label="Portfolio ID"
					name="portfolioId"
					defaultValue={defaultValues.portfolioId}
					placeholder="your own Invo portfolio UUID"
					hint="Must be a portfolio you created on your own Invo profile - verified on save."
					mono
				/>

				<ToggleRow
					label="Auto-share to feed"
					hint="Also reposts every mirrored action to your Invo feed immediately."
					name="autoShare"
					checked={autoShare}
					onChange={setAutoShare}
				/>

				<div className={autoShare ? "" : "hidden"}>
					<Field
						label="Caption"
						name="caption"
						defaultValue={defaultValues.caption}
						placeholder="optional - posted with no caption if left blank"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
				{state.ok && <p className="text-[13px] text-profit">Saved.</p>}
				<Button type="submit" variant="primary" disabled={pending} className="self-start">
					{pending ? "Saving..." : "Save Trader mode settings"}
				</Button>
			</div>
		</form>
	);
}
