import "server-only";
import { getInvoClient } from "../invo/client";
import { readPortfolioRisk } from "./readPortfolioRisk";
import type { FollowedPortfolioSummary } from "./loadFollowedPortfolios";

export interface PortfolioAnalysisResult {
	found: boolean;
	isFollowing: boolean;
	portfolio?: FollowedPortfolioSummary;
}

/** Portfolio ids are UUIDs; a pasted id missing its hyphens (e.g. copied from somewhere that stripped them) is still unambiguously the same id. */
function toCanonicalUuid(id: string): string {
	const stripped = id.replace(/-/g, "");
	if (!/^[0-9a-f]{32}$/i.test(stripped)) return id;
	return [stripped.slice(0, 8), stripped.slice(8, 12), stripped.slice(12, 16), stripped.slice(16, 20), stripped.slice(20)]
		.join("-")
		.toLowerCase();
}

/**
 * Any portfolio by id, followed or not - real Invo data throughout, not an
 * estimate. Traced live from app.invoapp.com's own network calls on a
 * portfolio's public profile page: `get_portfolio_by_id` returns the exact
 * same stats object `get_users_followed_portfolios` does, for any portfolio,
 * since that's what Invo's own "Discover" browsing uses under the hood.
 */
export async function loadPortfolioAnalysis(rawPortfolioId: string): Promise<PortfolioAnalysisResult> {
	const portfolioId = toCanonicalUuid(rawPortfolioId);
	try {
		const invo = await getInvoClient();
		const [result, riskEntries] = await Promise.all([invo.getPortfolioById(portfolioId), Promise.resolve(readPortfolioRisk())]);
		const risk = riskEntries.find((r) => r.portfolioId === result.id);
		return {
			found: true,
			isFollowing: result.isFollowing,
			portfolio: { ...result, minMarginPct: risk?.minMarginPct ?? null, maxMarginPct: risk?.maxMarginPct ?? null },
		};
	} catch {
		return { found: false, isFollowing: false };
	}
}
