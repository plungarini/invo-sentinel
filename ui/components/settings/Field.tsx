/**
 * Shared input styling for every settings/wizard form - `bg-bg` (the app's
 * darkest surface) with a visible `border-border` outline, so a field reads
 * clearly regardless of which container it sits in (a `bg-card` Settings
 * card or a `bg-card` Modal - `--card` and `--surface` are the same color in
 * this app's palette, so a field styled with just `bg-surface` and no border
 * was effectively invisible against either one until focused).
 */
export const fieldInputClass =
	"w-full rounded-xl border border-border bg-bg px-4 py-2.5 text-[14px] text-text outline-none transition-colors placeholder:text-text-faint focus:border-accent";

export default function Field({
	label,
	name,
	value,
	defaultValue,
	onChange,
	placeholder,
	hint,
	required,
	textarea,
	rows = 3,
	mono = false,
}: {
	/** Omit when the surrounding context already names the field (e.g. the wizard's own step heading) - avoids showing the same label twice. */
	label?: string;
	name: string;
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	placeholder?: string;
	hint?: string;
	required?: boolean;
	textarea?: boolean;
	rows?: number;
	mono?: boolean;
}) {
	const className = `${fieldInputClass} ${mono ? "font-mono" : ""} ${textarea ? "resize-none" : ""}`;
	const inputProps = {
		name,
		value,
		defaultValue,
		onChange: onChange ? (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value) : undefined,
		placeholder,
		required,
	};

	return (
		<label className="flex flex-col gap-1.5">
			{label && <span className="text-[13px] font-semibold text-text-muted">{label}</span>}
			{textarea ? (
				<textarea {...inputProps} rows={rows} className={className} />
			) : (
				<input {...inputProps} className={className} />
			)}
			{hint && <span className="text-[12px] text-text-faint">{hint}</span>}
		</label>
	);
}
