"use client";

import type { AnalyticsPeriod } from "@/types/ui";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const PERIODS: { value: AnalyticsPeriod; label: string; shortLabel: string }[] = [
	{ value: "today", label: "Today", shortLabel: "Today" },
	{ value: "wtd", label: "Week to date", shortLabel: "WTD" },
	{ value: "mtd", label: "Month to date", shortLabel: "MTD" },
	{ value: "ytd", label: "Year to date", shortLabel: "YTD" },
	{ value: "all", label: "All Time", shortLabel: "All" },
];

export default function AnalyticsPeriodSelector({
	period,
	onChange,
}: {
	period: AnalyticsPeriod;
	onChange: (period: AnalyticsPeriod) => void;
}) {
	const isMobile = useMediaQuery("(max-width: 767px)");

	return (
		<div className="flex flex-wrap gap-1.5">
			{PERIODS.map((p) => (
				<button
					key={p.value}
					type="button"
					onClick={() => onChange(p.value)}
					className={`cursor-pointer rounded-full px-2.5 py-1 text-[12.5px] font-semibold transition-all duration-150 ease-out active:scale-[0.97] ${
						period === p.value ? "bg-surface text-text" : "text-text-muted hover:bg-surface/60 hover:text-text"
					}`}
				>
					{isMobile ? p.shortLabel : p.label}
				</button>
			))}
		</div>
	);
}
