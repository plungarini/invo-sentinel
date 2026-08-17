import type { ReactNode } from "react";
import Card from "@/components/shared/Card";
import BigNumber from "@/components/shared/BigNumber";
import BalanceChange24hBadge from "@/components/shared/BalanceChange24hBadge";
import { formatUsd } from "@/lib/format";

export default function TotalBalanceCard({
	accountValueUsd,
	availableUsd,
	feesUsd,
	size = "lg",
	rightSlot,
	footer,
}: {
	accountValueUsd: number;
	/** Capital not currently allocated to open positions. */
	availableUsd?: number;
	feesUsd?: number;
	size?: "sm" | "lg";
	rightSlot?: ReactNode;
	footer?: ReactNode;
}) {
	const stats: { label: string; value: string }[] = [];
	if (availableUsd != null) stats.push({ label: "Available", value: formatUsd(availableUsd) });
	if (feesUsd != null && feesUsd > 0) stats.push({ label: "Fees", value: formatUsd(feesUsd) });

	return (
		<Card>
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-[15px] text-text-muted">Total Balance</p>
					<BigNumber
						value={accountValueUsd}
						className={`mt-1 block font-bold leading-none ${size === "lg" ? "text-[44px]" : "text-[36px]"}`}
					/>
					<BalanceChange24hBadge />
					{stats.length > 0 && (
						<div className="mt-2 flex items-center gap-2">
							{stats.map((s) => (
								<div key={s.label} className="rounded-md border border-border bg-surface px-2.5 py-1.5">
									<p className="text-[10px] leading-none text-text-muted">{s.label}</p>
									<p className="mt-1 text-[12px] font-semibold leading-none tabular-nums">{s.value}</p>
								</div>
							))}
						</div>
					)}
				</div>
				{rightSlot}
			</div>
			{footer}
		</Card>
	);
}
