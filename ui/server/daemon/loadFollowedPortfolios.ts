import "server-only";
import { readFollowedPortfolios } from "./readFollowedPortfolios";
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

/**
 * Real followed-trader list + this daemon's per-portfolio risk override, if
 * any - for the right rail. Reads the daemon's own shared state file rather
 * than calling Invo directly - confirmed live 2026-08-11 that an independent
 * UI-side InvoClient call shares the same per-account rate-limit budget as
 * the daemon's much more frequent polling, with no cache and no timeout, so
 * a rate-limit storm on the daemon side (e.g. from a follow-spree) hung this
 * widget for however long the daemon's own retry-after backoff took, on
 * every single page navigation. This file is only ever as stale as the
 * daemon's last cycle (a few seconds) and never calls Invo at all.
 */
export async function loadFollowedPortfolios(): Promise<FollowedPortfolioSummary[]> {
	const portfolios = readFollowedPortfolios();
	const riskEntries = readPortfolioRisk();
	const riskById = new Map(riskEntries.map((r) => [r.portfolioId, r]));

	return portfolios.map((p) => ({
		...p,
		minMarginPct: riskById.get(p.id)?.minMarginPct ?? null,
		maxMarginPct: riskById.get(p.id)?.maxMarginPct ?? null,
	}));
}
