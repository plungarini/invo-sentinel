import { loadWallet } from "@/server/hyperliquid/loadWallet";
import WalletClient from "@/components/wallet/WalletClient";
import PageHeader from "@/components/shared/PageHeader";
import type { WalletResponse } from "@/hooks/useWallet";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
	// Transfers and trade history are fetched client-side, on demand, only once
	// their tab is opened - no reason to hold up this page's response on them.
	const initialData = await loadWallet().catch((): WalletResponse | undefined => undefined);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Wallet" />
			<WalletClient initialData={initialData} />
		</div>
	);
}
