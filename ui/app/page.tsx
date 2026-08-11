import { loadStatus } from "@/server/daemon/loadStatus";
import { loadWallet } from "@/server/hyperliquid/loadWallet";
import { loadAnalytics } from "@/server/analytics/loadAnalytics";
import OverviewClient from "@/components/homepage/OverviewClient";
import PageHeader from "@/components/shared/PageHeader";
import type { WalletResponse } from "@/hooks/useWallet";
import type { AnalyticsSummary } from "@/types/ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
	const initialStatus = loadStatus();
	const [initialWallet, initialAnalytics] = await Promise.all([
		loadWallet().catch((): WalletResponse | undefined => undefined),
		loadAnalytics().catch((): AnalyticsSummary | undefined => undefined),
	]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Overview" live />
			<OverviewClient initialStatus={initialStatus} initialWallet={initialWallet} initialAnalytics={initialAnalytics} />
		</div>
	);
}
