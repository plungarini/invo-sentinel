"use client";

import type { AnalyticsPeriod } from "@/types/ui";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
	{ value: "today", label: "Today" },
	{ value: "wtd", label: "Week" },
	{ value: "mtd", label: "Month" },
	{ value: "ytd", label: "Year" },
	{ value: "all", label: "All Time" },
];

export default function AnalyticsPeriodSelector({
	period,
	onChange,
}: {
	period: AnalyticsPeriod;
	onChange: (period: AnalyticsPeriod) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{PERIODS.map((p) => (
				<button
					key={p.value}
					type="button"
					onClick={() => onChange(p.value)}
					className={`cursor-pointer rounded-full px-4 py-2 text-[14px] font-semibold transition-all duration-150 ease-out active:scale-[0.97] ${
						period === p.value
							? "bg-bg text-text"
							: "bg-surface-hover text-text-muted hover:bg-[#232326] hover:text-text"
					}`}
				>
					{p.label}
				</button>
			))}
		</div>
	);
}
