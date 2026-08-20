"use client";

import { useActionState, useState } from "react";
import Button from "@/components/shared/Button";
import { saveEmergencySettings, type ActionState } from "@/app/settings/actions";
import type { EmergencyFormValues } from "@/server/daemon/settings";
import ToggleRow from "./ToggleRow";

const INITIAL_STATE: ActionState = { ok: false };

export default function EmergencySettingsForm({ defaultValues }: { defaultValues: EmergencyFormValues }) {
	const [state, formAction, pending] = useActionState(saveEmergencySettings, INITIAL_STATE);
	const [noNewPositions, setNoNewPositions] = useState(defaultValues.noNewPositions);
	const [fullStop, setFullStop] = useState(defaultValues.fullStop);

	return (
		<form action={formAction} className="flex flex-col gap-5">
			<ToggleRow
				label="Don't open new positions"
				hint="Already-tracked positions still adjust and close per trader signal; only a brand-new open is blocked."
				name="noNewPositions"
				checked={noNewPositions}
				onChange={setNoNewPositions}
			/>
			<ToggleRow
				label="Full stop auto-copy"
				hint="Halts everything - no opens, adjusts, or closes at all. Every real position is left exactly as-is for manual handling."
				name="fullStop"
				checked={fullStop}
				onChange={setFullStop}
			/>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
				{state.ok && <p className="text-[13px] text-profit">Saved. Takes effect on the next poll cycle.</p>}
				<Button type="submit" variant="primary" disabled={pending} className="self-start">
					{pending ? "Saving..." : "Save emergency settings"}
				</Button>
			</div>
		</form>
	);
}
