import Card from "@/components/shared/Card";
import BigNumber from "@/components/shared/BigNumber";
import BalanceChange24hBadge from "@/components/shared/BalanceChange24hBadge";

export default function BalanceCard({ accountValueUsd, feesLabel }: { accountValueUsd: number; feesLabel?: string }) {
	return (
		<Card>
			<div className="flex flex-wrap items-end justify-between gap-2">
				<div>
					<p className="text-[15px] text-text-muted">Total Balance</p>
					<BigNumber value={accountValueUsd} className="mt-1 block text-[44px] font-bold leading-none" />
					<BalanceChange24hBadge />
				</div>
				{feesLabel && <p className="pb-1 text-[13px] text-text-muted">{feesLabel}</p>}
			</div>
		</Card>
	);
}
