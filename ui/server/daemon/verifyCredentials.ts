import "server-only";
import { InvoClient } from "@daemon/clients/invo-client.js";
import { HyperliquidClient } from "@daemon/clients/hyperliquid-client.js";

export interface VerifyCredentialsResult {
	ok: boolean;
	error?: string;
}

/**
 * Real, live checks against the actual resolved values before they're
 * trusted - the same two checks `npm run preflight` opens with (Invo auth,
 * HL SDK connect), just without preflight's balance/followed-portfolios
 * calls, which aren't needed to answer "did the user type something that
 * actually works." Throwaway client instances, deliberately not the cached
 * singletons from `invo/client.ts`/`hyperliquid/client.ts` - those cache
 * against whatever's already saved, not the not-yet-saved values being
 * checked here.
 *
 * Kept in its own non-"use server" module (not inlined into
 * `app/settings/actions.ts`) because a "use server" file's own webpack
 * bundling (Next's flight-action-entry-loader) doesn't resolve the
 * `@daemon/*` path alias the same way normal modules do - confirmed live,
 * see `ui/server/daemon/paths.ts`'s `getAppConfig` for the same workaround.
 */
export async function verifyCredentials(values: {
	invoRefreshToken: string;
	hlAgentKey: string;
	walletAddress: string;
}): Promise<VerifyCredentialsResult> {
	try {
		await new InvoClient(values.invoRefreshToken).getFollowedPortfolios();
	} catch (e) {
		return { ok: false, error: `Invo refresh token doesn't work: ${e instanceof Error ? e.message : String(e)}` };
	}

	try {
		await new HyperliquidClient(values.hlAgentKey, values.walletAddress).connect();
	} catch (e) {
		return { ok: false, error: `Hyperliquid agent key/wallet address doesn't work: ${e instanceof Error ? e.message : String(e)}` };
	}

	return { ok: true };
}

/**
 * Trader mode mirrors onto a portfolio the user must own themselves - two
 * checks, not one: `get_investments_sims` succeeding at all (a portfolio's
 * paper-trading sim balance appears to only be readable by its owner - see
 * docs/research/trader-mode-spike.md research item 1/3), AND the portfolio's
 * own `ownerId` (from `get_portfolio_by_id`) matching this account's own
 * user id decoded from its own JWT - belt-and-suspenders, since the sims
 * endpoint's exact access scoping was never confirmed against a genuinely
 * non-owned portfolio.
 */
export async function verifyTraderModePortfolio(invoRefreshToken: string, portfolioId: string): Promise<VerifyCredentialsResult> {
	const invo = new InvoClient(invoRefreshToken);
	try {
		const sims = await invo.getInvestmentsSims(portfolioId);
		if (!sims.success) return { ok: false, error: sims.error?.msg ?? "Could not read this portfolio's sim balance - is the ID correct?" };
	} catch (e) {
		return { ok: false, error: `Could not read this portfolio's sim balance: ${e instanceof Error ? e.message : String(e)}` };
	}

	try {
		const portfolio = await invo.getPortfolioById(portfolioId);
		if (portfolio.ownerId !== invo.getOwnUserId()) {
			return { ok: false, error: "This portfolio isn't owned by the account this Invo refresh token belongs to." };
		}
	} catch (e) {
		return { ok: false, error: `Could not look up this portfolio: ${e instanceof Error ? e.message : String(e)}` };
	}

	return { ok: true };
}
