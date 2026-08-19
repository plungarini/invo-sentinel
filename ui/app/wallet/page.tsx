import { loadWallet } from "@/server/hyperliquid/loadWallet";
import { loadFeesTotal } from "@/server/history/loadFeesTotal";
import WalletClient from "@/components/wallet/WalletClient";
import PageHeader from "@/components/shared/PageHeader";
import type { WalletResponse } from "@/hooks/useWallet";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
	// Transfers and trade history are fetched client-side, on demand, only once
	// their tab is opened - no reason to hold up this page's response on them.
	// The Fees stat uses the lightweight loadFeesTotal, not the full analytics
	// aggregation (which also fetches live HL positions) - fetched here so it
	// renders immediately instead of popping in after a client round trip.
	const [initialData, initialFees] = await Promise.all([
		loadWallet().catch((): WalletResponse | undefined => undefined),
		loadFeesTotal().catch((): { totalFeesUsd: number } | undefined => undefined),
	]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Wallet" />
			<WalletClient initialData={initialData} initialFees={initialFees} />
		</div>
	);
}
