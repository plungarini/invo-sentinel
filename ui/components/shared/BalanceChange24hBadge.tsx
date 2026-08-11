"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import { useBalanceChange24h } from "@/hooks/useBalanceChange24h";
import { formatUsd } from "@/lib/format";
import Skeleton from "@/components/shared/Skeleton";

export default function BalanceChange24hBadge() {
	const { data, isLoading } = useBalanceChange24h();

	// `data === null` is a real, resolved "unavailable" answer (e.g. a brand-new
	// account with no 24h history yet) - only the still-in-flight case gets a skeleton.
	if (isLoading) {
		return (
			<div className="mt-3 flex items-center gap-2">
				<Skeleton className="h-6 w-6 rounded-lg" />
				<Skeleton className="h-4 w-32" />
			</div>
		);
	}
	if (!data) return null;

	const isProfit = data.changeUsd >= 0;
	const Icon = isProfit ? ArrowUp : ArrowDown;
	const toneClass = isProfit ? "text-profit" : "text-loss";

	return (
		<div className="mt-3 flex items-center gap-2">
			<span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${isProfit ? "bg-profit/15" : "bg-loss/15"} ${toneClass}`}>
				<Icon className="h-3.5 w-3.5" strokeWidth={3} />
			</span>
			<p className={`text-[15px] font-semibold leading-none ${toneClass}`}>
				{Math.abs(data.changePercent).toFixed(2)}% · {formatUsd(Math.abs(data.changeUsd))} <span className="font-medium text-text-muted">24h</span>
			</p>
		</div>
	);
}
