import PageHeader from '@/components/shared/PageHeader';
import PortfolioAnalysisLoader from '@/components/tools/PortfolioAnalysisLoader';
import RowSkeleton from '@/components/wallet/RowSkeleton';
import { Suspense } from 'react';

// See app/layout.tsx: the layout's setup-wizard gate must never be statically prerendered.
export const dynamic = 'force-dynamic';

export default function PortfolioAnalysisPage() {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Portfolio Analysis" />
			<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-24 pr-3 pt-14 md:pb-6 md:pt-0">
				<Suspense fallback={<RowSkeleton count={2} />}>
					<PortfolioAnalysisLoader />
				</Suspense>
			</div>
		</div>
	);
}
