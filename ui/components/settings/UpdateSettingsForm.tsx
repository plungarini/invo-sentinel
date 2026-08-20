"use client";

import { useActionState, useRef, useState } from "react";
import Button from "@/components/shared/Button";
import { saveUpdateSettings, type ActionState } from "@/app/settings/actions";
import type { UpdateFormValues } from "@/server/daemon/settings";
import ToggleRow from "./ToggleRow";
import { useAutoSaveForm } from "./useAutoSaveForm";

const INITIAL_STATE: ActionState = { ok: false };

export default function UpdateSettingsForm({ defaultValues }: { defaultValues: UpdateFormValues }) {
	const [state, formAction, pending] = useActionState(saveUpdateSettings, INITIAL_STATE);
	const [autoUpdate, setAutoUpdate] = useState(defaultValues.autoUpdate);
	const formRef = useRef<HTMLFormElement>(null);
	const autoSave = useAutoSaveForm(formRef, { pending });

	const upToDate = !defaultValues.latestVersionSeen || defaultValues.latestVersionSeen === defaultValues.currentVersion;

	return (
		<form ref={formRef} action={formAction} className="flex flex-col gap-5" onChange={autoSave.onChange} onBlur={autoSave.onBlur}>
			<div className="flex flex-col gap-1 text-[13px]">
				<p className="text-text-secondary">
					Running <span className="font-mono text-text-primary">v{defaultValues.currentVersion}</span>
					{!upToDate && (
						<span className="text-loss"> - v{defaultValues.latestVersionSeen} is available</span>
					)}
				</p>
				<p className="text-text-faint">
					{defaultValues.lastCheckedAt
						? `Last checked ${new Date(defaultValues.lastCheckedAt).toLocaleString()}`
						: "Not checked yet - only runs against a packaged release build, not a source checkout."}
				</p>
			</div>

			<ToggleRow
				label="Auto-update"
				hint="Checks github.com/plungarini/invo-sentinel every ~30min. A new release is downloaded, checksum-verified, and installed on the next restart - never touches your data, logs, or .env. No effect on a source/tsx checkout."
				name="autoUpdate"
				checked={autoUpdate}
				onChange={setAutoUpdate}
			/>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
				{state.ok && <p className="text-[13px] text-profit">Saved.</p>}
				<Button type="submit" variant="primary" disabled={pending} className="self-start">
					{pending ? "Saving..." : "Save update settings"}
				</Button>
			</div>
		</form>
	);
}
