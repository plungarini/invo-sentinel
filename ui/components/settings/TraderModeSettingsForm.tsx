"use client";

import { useActionState, useState } from "react";
import Button from "@/components/shared/Button";
import { saveTraderModeSettings, type ActionState } from "@/app/settings/actions";
import type { TraderModeFormValues } from "@/server/daemon/settings";
import Field from "./Field";

const INITIAL_STATE: ActionState = { ok: false };

function ToggleRow({
	label,
	hint,
	name,
	defaultChecked,
	checked,
	onChange,
}: {
	label: string;
	hint?: string;
	name: string;
	defaultChecked?: boolean;
	checked?: boolean;
	onChange?: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-start justify-between gap-4">
			<span className="flex flex-col gap-0.5">
				<span className="text-[13px] font-semibold text-text-muted">{label}</span>
				{hint && <span className="text-[12px] text-text-faint">{hint}</span>}
			</span>
			<span className="relative mt-0.5 inline-flex shrink-0 items-center">
				<input
					type="checkbox"
					name={name}
					defaultChecked={defaultChecked}
					checked={checked}
					onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
					className="peer sr-only"
				/>
				<span
					aria-hidden
					className="h-6 w-11 cursor-pointer rounded-full border border-border bg-bg transition-colors duration-150 ease-out peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
				/>
				<span
					aria-hidden
					className="pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 translate-x-0 rounded-full bg-text-faint transition-transform duration-150 ease-out peer-checked:translate-x-5 peer-checked:bg-white"
				/>
			</span>
		</label>
	);
}

export default function TraderModeSettingsForm({ defaultValues }: { defaultValues: TraderModeFormValues }) {
	const [state, formAction, pending] = useActionState(saveTraderModeSettings, INITIAL_STATE);
	const [enabled, setEnabled] = useState(defaultValues.enabled);
	const [autoShare, setAutoShare] = useState(defaultValues.autoShare);

	return (
		<form action={formAction} className="flex flex-col gap-6">
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
