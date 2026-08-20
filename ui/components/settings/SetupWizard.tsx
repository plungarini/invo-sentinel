"use client";

import { useActionState, useState } from "react";
import Modal from "@/components/shared/Modal";
import Button from "@/components/shared/Button";
import Field from "./Field";
import { saveWizardSecrets, type ActionState } from "@/app/settings/actions";
import { CREDENTIAL_STEPS } from "./CredentialInstructions";
import type { WizardPrefill } from "@/server/daemon/settings";

const INITIAL_STATE: ActionState = { ok: false };

/**
 * Full-screen, undismissible first-run gate - rendered by the root layout in
 * place of the normal sidebar/dashboard whenever `ConfigStore.hasRequiredSecretsInDb()`
 * is false. Styled as the same modal card used for trade details elsewhere in
 * the app (`Modal`, with no close affordance - there's nothing to dismiss to
 * yet, and no title - the step progress indicator is the only header), walking
 * through the 3 required values one at a time so each step can show only the
 * retrieval instructions relevant to it. Submitting on the last step
 * revalidates the root layout, which re-checks the gate and swaps to the real
 * dashboard on the next render - no client redirect needed.
 */
export default function SetupWizard({ prefill }: { prefill: WizardPrefill }) {
	const [state, formAction, pending] = useActionState(saveWizardSecrets, INITIAL_STATE);
	const [step, setStep] = useState(0);
	const [stepError, setStepError] = useState<string | null>(null);
	// Controlled, keyed by field - a step's value must survive navigating away
	// and back to it (Next/Back only changes which step is *visible*, via
	// `hidden`, not which fields are mounted), which an uncontrolled/ref-based
	// input can't guarantee across arbitrary re-renders. The two secret fields
	// start blank even when a value already resolves from `.env`/DB - that
	// resolved value is only ever known server-side (see `maskedHint` below
	// and `saveWizardSecrets`), never sent here as real text. `walletAddress`
	// isn't a secret, so it prefills in full and is immediately editable.
	const [values, setValues] = useState<Record<string, string>>({
		invoRefreshToken: "",
		hlAgentKey: "",
		walletAddress: prefill.walletAddress,
	});

	const maskedHint = (key: string): string =>
		key === "invoRefreshToken" ? prefill.maskedInvoRefreshToken : key === "hlAgentKey" ? prefill.maskedHlAgentKey : "";

	/** A step can be skipped past without typing anything if it already has an effective value (from `.env` or a prior DB save) to confirm. */
	const hasEffectiveValue = (key: string): boolean => values[key].trim() !== "" || maskedHint(key) !== "";

	const isLast = step === CREDENTIAL_STEPS.length - 1;

	const goNext = () => {
		if (!hasEffectiveValue(CREDENTIAL_STEPS[step].key)) {
			setStepError("This value is required to continue.");
			return;
		}
		setStepError(null);
		setStep((s) => Math.min(s + 1, CREDENTIAL_STEPS.length - 1));
	};

	const goBack = () => {
		setStepError(null);
		setStep((s) => Math.max(s - 1, 0));
	};

	const onSubmitClick = (e: React.MouseEvent<HTMLButtonElement>) => {
		if (!hasEffectiveValue(CREDENTIAL_STEPS[step].key)) {
			e.preventDefault();
			setStepError("This value is required to continue.");
		}
	};

	return (
		<div className="flex h-screen w-full items-center justify-center bg-bg p-4">
			<Modal>
				<form action={formAction} className="flex flex-col gap-5">
					<div className="flex flex-col items-center gap-2">
						<div className="flex items-center gap-1.5">
							{CREDENTIAL_STEPS.map((s, i) => (
								<span
									key={s.key}
									className={`h-1.5 rounded-full transition-all duration-150 ${i === step ? "w-6 bg-accent" : "w-1.5 bg-surface-hover"}`}
								/>
							))}
						</div>
						<span className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">
							Step {step + 1} of {CREDENTIAL_STEPS.length}
						</span>
					</div>

					{CREDENTIAL_STEPS.map((s, i) => (
						<div key={s.key} className={i === step ? "flex flex-col gap-3" : "hidden"}>
							<h2 className="text-[17px] font-bold tracking-tight">{s.label}</h2>
							<div className="rounded-xl border border-border bg-surface-hover p-3 text-[13px] leading-relaxed">
								{s.instructions}
							</div>
							<Field
								name={s.key}
								value={values[s.key]}
								onChange={(v) => setValues((prev) => ({ ...prev, [s.key]: v }))}
								placeholder={maskedHint(s.key) ? `Current: ${maskedHint(s.key)}` : s.placeholder}
								hint={maskedHint(s.key) ? "Leave blank to keep this value." : undefined}
								textarea={s.inputType === "textarea"}
								mono
							/>
						</div>
					))}

					{(stepError || state.error) && <p className="text-[13px] text-loss">{stepError ?? state.error}</p>}

					<div className="flex items-center justify-between gap-3 border-t border-border pt-5">
						<Button type="button" variant="ghost" onClick={goBack} className={step === 0 ? "invisible" : ""}>
							Back
						</Button>
						{/*
						 * Distinct `key`s force React to unmount/remount across the
						 * isLast boundary instead of patching one button's `type`
						 * attribute from "button" to "submit" in place - reusing the
						 * same DOM node for both would let the click that flips
						 * `isLast` (advancing onto the last step) land on a button
						 * whose type just became "submit" mid-dispatch, submitting the
						 * form as a side effect of that same click (confirmed live:
						 * the wizard saved without "Save and start" ever being
						 * clicked, from exactly this pattern).
						 */}
						{isLast ? (
							<Button key="submit" type="submit" variant="primary" disabled={pending} onClick={onSubmitClick}>
								{pending ? "Verifying..." : "Save and start"}
							</Button>
						) : (
							<Button key="next" type="button" variant="primary" onClick={goNext}>
								Next
							</Button>
						)}
					</div>
				</form>
			</Modal>
		</div>
	);
}
