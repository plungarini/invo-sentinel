"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import RowSkeleton from "@/components/wallet/RowSkeleton";

// Genuinely lazy: this tool's code (and the SWR fetch it triggers) only ships
// to the browser once someone actually opens this page, not bundled into the
// rest of the app's initial load.
const PortfolioAnalysisPanel = dynamic(() => import("@/components/tools/PortfolioAnalysisPanel"), {
	ssr: false,
	loading: () => <RowSkeleton count={2} />,
});

export default function PortfolioAnalysisLoader() {
	const searchParams = useSearchParams();
	const portfolioId = searchParams.get("portfolioId") ?? "";
	return <PortfolioAnalysisPanel initialPortfolioId={portfolioId} />;
}
