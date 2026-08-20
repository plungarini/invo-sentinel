"use client";

import { useState } from "react";
import { fieldInputClass } from "./Field";

/**
 * Renders `currentValue` as the field's actual displayed content (not a
 * placeholder) - masked already upstream for a real secret, shown in full
 * for a non-secret value like a wallet address. `secret` controls whether
 * that's dotted out via `type="password"` (reveal-on-focus via
 * `type="text"`); non-secret fields stay `type="text"` throughout but keep
 * the same interaction otherwise. Focusing clears the field so typing
 * replaces `currentValue` outright rather than appending to it; blurring
 * with nothing typed restores it. The real submitted `name`d input is a
 * separate hidden field that only ever carries what was actually typed -
 * `currentValue` itself is never a valid submission, so blank still means
 * "leave the current value unchanged" to the server action.
 */
export default function SecretField({
	label,
	name,
	currentValue,
	secret = true,
	placeholder,
	hint,
	required,
	mono = true,
	onChange,
}: {
	label?: string;
	name: string;
	currentValue?: string;
	secret?: boolean;
	placeholder?: string;
	hint?: string;
	required?: boolean;
	mono?: boolean;
	onChange?: (typed: string) => void;
}) {
	const [typed, setTyped] = useState("");
	const [cleared, setCleared] = useState(false);
	const [focused, setFocused] = useState(false);

	const showingCurrent = !cleared && typed === "" && !!currentValue;
	const displayValue = showingCurrent ? currentValue! : typed;
	const className = `${fieldInputClass} ${mono ? "font-mono" : ""}`;

	return (
		<label className="flex flex-col gap-1.5">
			{label && <span className="text-[13px] font-semibold text-text-muted">{label}</span>}
			<input
				type={secret && !focused ? "password" : "text"}
				value={displayValue}
				placeholder={placeholder}
				required={required && !currentValue}
				onFocus={() => {
					setFocused(true);
					if (showingCurrent) setCleared(true);
				}}
				onBlur={() => {
					setFocused(false);
					if (typed === "") setCleared(false);
				}}
				onChange={(e) => {
					setTyped(e.target.value);
					onChange?.(e.target.value);
				}}
				className={className}
			/>
			<input type="hidden" name={name} value={typed} />
			{hint && <span className="text-[12px] text-text-faint">{hint}</span>}
		</label>
	);
}
