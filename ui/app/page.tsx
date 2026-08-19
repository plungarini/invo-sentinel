import { loadStatus } from "@/server/daemon/loadStatus";
import { loadWallet } from "@/server/hyperliquid/loadWallet";
import { loadAnalytics } from "@/server/analytics/loadAnalytics";
import { loadFeesTotal } from "@/server/history/loadFeesTotal";
import OverviewClient from "@/components/homepage/OverviewClient";
import PageHeader from "@/components/shared/PageHeader";
import type { WalletResponse } from "@/hooks/useWallet";
import type { AnalyticsSummary } from "@/types/ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
	const initialStatus = loadStatus();
	// initialAnalytics is only for the footer's All-time PnL/Win Rate - the Fees
	// stat itself uses the lightweight loadFeesTotal (see loadFeesTotal's doc),
	// same as Wallet, so neither page's Fees figure depends on a live HL fetch.
	const [initialWallet, initialAnalytics, initialFees] = await Promise.all([
		loadWallet().catch((): WalletResponse | undefined => undefined),
		loadAnalytics().catch((): AnalyticsSummary | undefined => undefined),
		loadFeesTotal().catch((): { totalFeesUsd: number } | undefined => undefined),
	]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Overview" live />
			<OverviewClient
				initialStatus={initialStatus}
				initialWallet={initialWallet}
				initialAnalytics={initialAnalytics}
				initialFees={initialFees}
			/>
		</div>
	);
}
