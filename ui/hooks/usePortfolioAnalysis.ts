import useSWR from "swr";
import { fetcher } from "@/lib/polling";
import type { PortfolioAnalysisResult } from "@/server/daemon/loadPortfolioAnalysis";

export function usePortfolioAnalysis(portfolioId: string | null) {
	return useSWR<PortfolioAnalysisResult>(
		portfolioId ? `/api/portfolio-analysis?portfolioId=${encodeURIComponent(portfolioId)}` : null,
		fetcher,
	);
}
