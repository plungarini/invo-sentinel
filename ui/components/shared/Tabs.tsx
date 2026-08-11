"use client";

export default function Tabs<T extends string>({
	tabs,
	active,
	onChange,
}: {
	tabs: readonly T[];
	active: T;
	onChange: (tab: T) => void;
}) {
	return (
		<div className="flex gap-2">
			{tabs.map((t) => (
				<button
					key={t}
					onClick={() => onChange(t)}
					className={`cursor-pointer rounded-full px-4 py-2 text-[14px] font-semibold transition-all duration-150 ease-out active:scale-[0.97] ${
						active === t ? "bg-surface text-text" : "text-text-muted hover:bg-surface/60 hover:text-text"
					}`}
				>
					{t}
				</button>
			))}
		</div>
	);
}
