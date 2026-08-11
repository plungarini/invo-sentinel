import "server-only";
import { getInvoClient } from "../invo/client";
import { readPortfolioRisk } from "./readPortfolioRisk";

export interface FollowedPortfolioSummary {
	id: string;
	title: string;
	description?: string | null;
	ownerUsername?: string;
	ownerName?: string;
	ownerVerified?: boolean;
	ownerAvatarUrl?: string;
	ownerAvatarColor?: string;
	winRate?: number;
	wonPositions?: number;
	lostPositions?: number;
	closedPositions?: number;
	openPositions?: number;
	followerCount?: number;
	currentWinStreak?: number;
	plSnapshot?: number;
	avgPlRealized?: number;
	avgHoldTimeSeconds?: number;
	liquidated?: boolean;
	minMarginPct: number | null;
	maxMarginPct: number | null;
}

/** Real followed-trader list + this daemon's per-portfolio risk override, if any - for the right rail. */
export async function loadFollowedPortfolios(): Promise<FollowedPortfolioSummary[]> {
	const [portfolios, riskEntries] = await Promise.all([
		getInvoClient().getFollowedPortfolios(),
		Promise.resolve(readPortfolioRisk()),
	]);
	const riskById = new Map(riskEntries.map((r) => [r.portfolioId, r]));

	return portfolios.map((p) => ({
		...p,
		minMarginPct: riskById.get(p.id)?.minMarginPct ?? null,
		maxMarginPct: riskById.get(p.id)?.maxMarginPct ?? null,
	}));
}
