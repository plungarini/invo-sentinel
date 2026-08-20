"use client";

import { useActionState } from "react";
import Button from "@/components/shared/Button";
import { saveRequiredSecrets, type ActionState } from "@/app/settings/actions";
import Field from "./Field";

const INITIAL_STATE: ActionState = { ok: false };

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

	return (
		<form action={formAction} className="flex flex-col gap-4">
			<Field
				label="Invo refresh token"
				name="invoRefreshToken"
				placeholder={editing && maskedHints.invoRefreshToken ? `Current: ${maskedHints.invoRefreshToken}` : "eyJ..."}
				hint={editing ? "Leave blank to keep the current value." : undefined}
				required={!editing}
				textarea
				mono
			/>
			<Field
				label="Hyperliquid agent key"
				name="hlAgentKey"
				placeholder={editing && maskedHints.hlAgentKey ? `Current: ${maskedHints.hlAgentKey}` : "0x..."}
				hint={editing ? "Leave blank to keep the current value." : undefined}
				required={!editing}
				mono
			/>
			<Field
				label="Wallet address"
				name="walletAddress"
				defaultValue={walletAddress}
				placeholder="0x..."
				required={!editing}
				mono
			/>

			{state.error && <p className="text-[13px] text-loss">{state.error}</p>}

			<Button type="submit" variant="primary" disabled={pending} className="self-start">
				{pending ? "Verifying..." : submitLabel}
			</Button>
		</form>
	);
}
