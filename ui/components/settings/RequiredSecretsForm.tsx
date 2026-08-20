"use client";

import { useActionState, useRef } from "react";
import Button from "@/components/shared/Button";
import { saveRequiredSecrets, type ActionState } from "@/app/settings/actions";
import SecretField from "./SecretField";
import { useAutoSaveForm } from "./useAutoSaveForm";

const INITIAL_STATE: ActionState = { ok: false };

const SECRET_FIELDS = ["invoRefreshToken", "hlAgentKey", "walletAddress"];

/** Blank means "leave unchanged" here - autosaving on a blur/change that touched nothing would just re-hit `saveRequiredSecrets`'s own "enter at least one value" rejection, plus a needless live credentials re-check for fields that didn't actually change. */
function hasTypedValue(formData: FormData): boolean {
	return SECRET_FIELDS.some((field) => String(formData.get(field) ?? "").trim() !== "");
}

/**
 * `maskedHints` carries display-only masked previews (e.g. "eyJ0…9f3a"), never
 * real secret values - the wizard passes none (fresh install, nothing set
 * yet, fields required); the Settings page passes them (fields optional,
 * blank = keep the current value, so rotating one token doesn't force
 * re-pasting all three).
 */
export default function RequiredSecretsForm({
	maskedHints,
	walletAddress = "",
	submitLabel = "Save credentials",
	onSaved,
}: {
	maskedHints?: { invoRefreshToken: string; hlAgentKey: string };
	walletAddress?: string;
	submitLabel?: string;
	onSaved?: () => void;
}) {
	const [state, formAction, pending] = useActionState(async (prev: ActionState, formData: FormData) => {
		const result = await saveRequiredSecrets(prev, formData);
		if (result.ok) onSaved?.();
		return result;
	}, INITIAL_STATE);

	const editing = !!maskedHints;
	const formRef = useRef<HTMLFormElement>(null);
	const autoSave = useAutoSaveForm(formRef, { pending, canSave: hasTypedValue });

	return (
		<form ref={formRef} action={formAction} className="flex flex-col gap-4" onChange={autoSave.onChange} onBlur={autoSave.onBlur}>
			<SecretField
				label="Invo refresh token"
				name="invoRefreshToken"
				currentValue={editing ? maskedHints.invoRefreshToken : undefined}
				placeholder="eyJ..."
				hint={editing ? "Click to edit, or leave as-is to keep the current value." : undefined}
				required={!editing}
			/>
			<SecretField
				label="Hyperliquid agent key"
				name="hlAgentKey"
				currentValue={editing ? maskedHints.hlAgentKey : undefined}
				placeholder="0x..."
				hint={editing ? "Click to edit, or leave as-is to keep the current value." : undefined}
				required={!editing}
			/>
			<SecretField
				label="Wallet address"
				name="walletAddress"
				currentValue={walletAddress || undefined}
				clearOnFocus={false}
				placeholder="0x..."
				hint={editing ? "Click to edit, or leave as-is to keep the current value." : undefined}
				required={!editing}
			/>

			{state.error && <p className="text-[13px] text-loss">{state.error}</p>}

			<Button type="submit" variant="primary" disabled={pending} className="self-start">
				{pending ? "Verifying..." : submitLabel}
			</Button>
		</form>
	);
}
