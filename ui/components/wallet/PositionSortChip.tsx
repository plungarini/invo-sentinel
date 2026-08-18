"use client";

import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import type { PositionSortKey, PositionSortState } from "@/hooks/usePositionSort";

const OPTIONS: { key: PositionSortKey; label: string }[] = [
	{ key: "pnl", label: "PnL" },
	{ key: "allocation", label: "Allocation" },
	{ key: "liqRisk", label: "Liq. Risk" },
	{ key: "updatedAt", label: "Updated At" },
	{ key: "symbol", label: "Symbol" },
];

/** Tri-state cycle per option: unset -> desc -> asc -> unset (back to the default PnL-desc sort). Picking a different key always starts it fresh at desc. */
function nextSort(current: PositionSortState, key: PositionSortKey): PositionSortState {
	if (current.key !== key) return { key, direction: "desc" };
	if (current.direction === "desc") return { key, direction: "asc" };
	return { key: null, direction: "desc" };
}

export default function PositionSortChip({
	sort,
	onChange,
}: {
	sort: PositionSortState;
	onChange: (next: PositionSortState) => void;
}) {
	// No key chosen still has a real applied sort (PnL, desc - see OpenPositionsTable's own
	// default) - treat it as such here too, so the chip and dropdown reflect what's actually
	// being applied instead of looking like nothing is active.
	const effectiveKey = sort.key ?? "pnl";
	const effectiveDirection = sort.key ? sort.direction : "desc";
	const activeLabel = OPTIONS.find((o) => o.key === effectiveKey)?.label;

	return (
		<div className="group relative inline-block">
			<button
				type="button"
				tabIndex={0}
				className="flex cursor-pointer items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold text-text-muted transition-all duration-150 ease-out hover:bg-surface/60 hover:text-text active:scale-[0.97] group-focus-within:bg-surface group-focus-within:text-text"
			>
				{`Sort: ${activeLabel}`}
				<ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-focus-within:rotate-180" />
			</button>

			<div
				className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-44 origin-top-right scale-95 rounded-xl border border-border bg-card p-1.5 opacity-0 shadow-lg transition duration-150 ease-out group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"
			>
				{OPTIONS.map((opt) => {
					const state = effectiveKey === opt.key ? effectiveDirection : null;
					return (
						<button
							key={opt.key}
							type="button"
							onClick={() => onChange(nextSort(sort, opt.key))}
							className={`flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors duration-150 active:scale-[0.97] ${
								state ? "bg-surface-hover text-text" : "text-text-muted hover:bg-surface-hover hover:text-text"
							}`}
						>
							{opt.label}
							{state === "desc" && <ArrowDown className="h-3.5 w-3.5" />}
							{state === "asc" && <ArrowUp className="h-3.5 w-3.5" />}
						</button>
					);
				})}
			</div>
		</div>
	);
}
