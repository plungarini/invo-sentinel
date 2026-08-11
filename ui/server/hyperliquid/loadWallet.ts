import "server-only";
import { readTrackedState } from "../daemon/readState";
import { getHyperliquidClient } from "./client";
import { getInvoClient } from "../invo/client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";
import type { WalletResponse } from "@/hooks/useWallet";

const CACHE_TTL_MS = 4_000; // just bounds the SSR/API-route path's own staleness; the browser gets fresher pushes over /api/wallet/stream

/** Bypasses the stale-while-revalidate cache below - for the shared poll loop in walletBroadcaster.ts, which wants the freshest data on every tick, not whatever's cached. */
export async function fetchWallet(): Promise<WalletResponse> {
	const hl = await getHyperliquidClient();
	const trackedState = readTrackedState();

	const liveMids = hl.getLiveMids();
	const [accountValueUsd, positions, allMids, fundingRates] = await Promise.all([
		hl.getAccountValueUsd(),
		hl.getPositions(),
		liveMids ? Promise.resolve(liveMids) : hl.getAllMids(),
		hl.getFundingRates().catch(() => ({}) as Record<string, number>),
	]);

	const trackedByCoin = new Map(Object.entries(trackedState).map(([baseId, entry]) => [entry.coin, { baseId, ...entry }]));
	const untrackedCoins = positions.filter((p) => !trackedByCoin.has(p.coin));

	const invo = getInvoClient();

	// The trader's own price target/stop-loss is only known via their Invo
	// investment record - never placed as a real HL order by this daemon (see
	// hyperliquid-client.ts's signing-quirk comment on why there's no
	// exchange-side TP/SL here), so it's fetched purely for display, only for
	// the handful of portfolios actually behind a currently-open, daemon-tracked position.
	const trackedPortfolioIds = new Set([...trackedByCoin.values()].map((e) => e.portfolioId).filter((id): id is string => !!id));
	const investmentByBaseId = new Map<string, { priceTarget: number | null; stopLoss: number | null }>();
	const trackedFetch =
		trackedPortfolioIds.size === 0
			? Promise.resolve()
			: Promise.all(
					[...trackedPortfolioIds].map(async (portfolioId) => {
						const open = await invo.getOpenInvestments(portfolioId).catch(() => []);
						for (const inv of open) investmentByBaseId.set(inv.baseId, { priceTarget: inv.priceTarget, stopLoss: inv.stopLoss });
					}),
				);

	// A position this daemon isn't managing still has real trader/TP/SL data
	// on Invo's side if it originally came from a followed trader - cross-
	// referencing every followed portfolio's own open investments by coin +
	// direction avoids depending on this daemon's own local state for that,
	// same approach as history's cross-referencing. Unique match only; two
	// followed traders both holding the same coin+direction is left unattributed
	// rather than guessed.
	const invoMatchByCoin = new Map<
		string,
		{ portfolioTitle: string; ownerUsername?: string; priceTarget: number | null; stopLoss: number | null }
	>();
	const crossRefFetch =
		untrackedCoins.length === 0
			? Promise.resolve()
			: invo
					.getFollowedPortfolios()
					.catch(() => [])
					.then(async (portfolios) => {
						const allOpen = (await Promise.all(portfolios.map((p) => invo.getOpenInvestments(p.id).catch(() => [])))).flat();
						for (const p of untrackedCoins) {
							const isLong = parseFloat(p.szi) > 0;
							const candidates = allOpen.filter((inv) => inv.ticker === p.coin && inv.directionLong === isLong);
							if (candidates.length === 1) {
								const inv = candidates[0];
								invoMatchByCoin.set(p.coin, {
									portfolioTitle: inv.portfolio?.title ?? "",
									ownerUsername: inv.owner?.username,
									priceTarget: inv.priceTarget,
									stopLoss: inv.stopLoss,
								});
							}
						}
					});

	await Promise.all([trackedFetch, crossRefFetch]);

	return {
		accountValueUsd,
		positions: positions.map((p) => {
			const tracked = trackedByCoin.get(p.coin) ?? null;
			const investment = tracked ? investmentByBaseId.get(tracked.baseId) : undefined;
			return {
				...p,
				markPx: allMids[p.coin] ?? null,
				fundingRateHourly: fundingRates[p.coin] ?? null,
				tracked: tracked ? { ...tracked, priceTarget: investment?.priceTarget ?? null, stopLoss: investment?.stopLoss ?? null } : null,
				invoMatch: invoMatchByCoin.get(p.coin) ?? null,
			};
		}),
	};
}

/** Shared by the /api/wallet route and the Wallet page's server-side initial fetch - stale-while-revalidate so navigation never blocks on a live HL round trip after the first load. */
export const loadWallet = staleWhileRevalidate(fetchWallet, CACHE_TTL_MS);
