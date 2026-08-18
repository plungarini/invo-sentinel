import BalanceChange24hBadge from '@/components/shared/BalanceChange24hBadge';
import BigNumber from '@/components/shared/BigNumber';
import Card from '@/components/shared/Card';
import StatTile from '@/components/shared/StatTile';
import { formatUsd } from '@/lib/format';
import { DollarSign, Percent } from 'lucide-react';
import type { ReactNode } from 'react';

export default function TotalBalanceCard({
	accountValueUsd,
	availableUsd,
	feesUsd,
	size = 'lg',
	footer,
}: {
	accountValueUsd: number;
	/** Capital not currently allocated to open positions. */
	availableUsd?: number;
	feesUsd?: number;
	size?: 'sm' | 'lg';
	footer?: ReactNode;
}) {
	const stats: { label: string; value: string; icon: typeof DollarSign; tone: 'profit' | 'amber' | 'red' }[] = [];
	if (availableUsd != null)
		stats.push({ label: 'Available', value: formatUsd(availableUsd), icon: DollarSign, tone: 'profit' });
	if (feesUsd != null && feesUsd > 0)
		stats.push({ label: 'Fees', value: formatUsd(feesUsd), icon: Percent, tone: 'red' });

	return (
		<Card>
			<div className="flex flex-col gap-5 sm:flex-row items-center sm:gap-6">
				<div className="flex-1 w-full">
					<p className="text-[15px] text-text-muted">Total Balance</p>
					<BigNumber
						value={accountValueUsd}
						className={`mt-1 block font-bold leading-none ${size === 'lg' ? 'text-[44px]' : 'text-[36px]'}`}
					/>
					<BalanceChange24hBadge />
				</div>
				{stats.length > 0 && (
					<div className="flex flex-col justify-center w-full gap-2 sm:w-[220px] sm:shrink-0">
						{stats.map((s) => (
							<div key={s.label} className="rounded-xl bg-surface-hover px-3 py-2.5">
								<StatTile label={s.label} value={s.value} icon={s.icon} tone={s.tone} />
							</div>
						))}
					</div>
				)}
			</div>
			{footer}
		</Card>
	);
}
