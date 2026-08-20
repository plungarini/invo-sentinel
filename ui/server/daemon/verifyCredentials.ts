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
