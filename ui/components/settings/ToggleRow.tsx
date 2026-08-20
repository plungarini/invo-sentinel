export default function ToggleRow({
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
