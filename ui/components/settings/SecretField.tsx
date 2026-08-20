"use client";

import { useState } from "react";
import { fieldInputClass } from "./Field";

/**
 * Renders `currentValue` as the field's actual displayed content (not a
 * placeholder) - masked already upstream for a real secret, shown in full
 * for a non-secret value like a wallet address. `type="password"` while
 * blurred, `type="text"` while focused, for every field - a wallet address
 * isn't actually secret, but is dotted out at rest the same way for visual
 * consistency with the two real secrets next to it.
 *
 * `clearOnFocus` (default on, matching the two real secrets) empties the
 * field the moment it's focused, so typing a new value replaces
 * `currentValue` outright rather than requiring it to be selected/deleted
 * first - right for pasting in a brand new secret. Set it off for a field
 * meant to be read/copied/edited in place (e.g. the wallet address): focus
 * just reveals the real value as plain text, unmolested, and the user edits
 * it like any normal text field.
 *
 * Either way, the real submitted `name`d input is a separate hidden field
 * that only ever carries what was actually typed - `currentValue` itself is
 * never a valid submission, so blank still means "leave the current value
 * unchanged" to the server action.
 */
export default function SecretField({
	label,
	name,
	currentValue,
	clearOnFocus = true,
	placeholder,
	hint,
	required,
	mono = true,
	onChange,
}: {
	label?: string;
	name: string;
	currentValue?: string;
	clearOnFocus?: boolean;
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
				type={focused ? "text" : "password"}
				value={displayValue}
				placeholder={placeholder}
				required={required && !currentValue}
				autoComplete="off"
				onFocus={() => {
					setFocused(true);
					if (showingCurrent && clearOnFocus) setCleared(true);
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
			<input type="hidden" name={name} value={typed} autoComplete="off" />
			{hint && <span className="text-[12px] text-text-faint">{hint}</span>}
		</label>
	);
}
