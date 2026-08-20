import { InvoClient } from '../clients/invo-client.js';
import { HyperliquidClient } from '../clients/hyperliquid-client.js';

export interface PreflightCheck {
	name: string;
	status: 'ok' | 'warn' | 'fail';
	detail: string;
}

/**
 * The real, live checks behind `npm run preflight` - Invo auth, HL SDK
 * connect, market data, and balance - factored out of src/cli/preflight.ts
 * so the same logic can run from a non-CLI caller (e.g. a future UI
 * "verify everything" action) without duplicating it. Takes raw credential
 * values rather than a loaded `AppConfig` so it works equally for
 * already-saved config (CLI) and not-yet-saved form input (a UI check before
 * commit) - callers push their own `env_vars`-equivalent check first if they
 * need one; this function assumes the 3 values are non-empty and just runs
 * the live checks against whatever's passed in.
 *
 * `ui/server/daemon/verifyCredentials.ts` deliberately does NOT call this -
 * it's a narrower, wizard-specific check (just Invo auth + HL connect, no
 * market data/balance calls) with its own UX-tailored error messages, kept
 * intentionally separate rather than forced into this shape.
 */
export async function runPreflightChecks(values: {
	invoRefreshToken: string;
	hlAgentKey: string;
	walletAddress: string;
}): Promise<PreflightCheck[]> {
	const checks: PreflightCheck[] = [];
	const push = (name: string, status: PreflightCheck['status'], detail: string) => checks.push({ name, status, detail });

	const invo = new InvoClient(values.invoRefreshToken);
	const hl = new HyperliquidClient(values.hlAgentKey, values.walletAddress);

	try {
		const days = invo.refreshTokenDaysRemaining();
		push('invo_refresh_expiry', days > 1 ? 'ok' : 'warn', `Refresh token valid for ${days.toFixed(1)} days`);
	} catch (e: any) {
		push('invo_refresh_expiry', 'fail', `Cannot decode refresh token: ${e.message}`);
	}

	try {
		const portfolios = await invo.getFollowedPortfolios();
		push('invo_auth', 'ok', 'Access token acquired via auto-refresh');
		push('invo_followed_portfolios', portfolios.length > 0 ? 'ok' : 'warn', `Following ${portfolios.length} portfolio(s)`);
	} catch (e: any) {
		push('invo_auth', 'fail', `Auth or followed-portfolios lookup failed: ${e.message}`);
	}

	try {
		await hl.connect();
		push('hl_agent_key', 'ok', 'SDK connected with agent key');
	} catch (e: any) {
		push('hl_agent_key', 'fail', `SDK connect failed: ${e.message}`);
	}

	try {
		const meta = await hl.getMeta();
		push('hl_market_data', 'ok', `${meta.universe.length} assets indexed`);
	} catch (e: any) {
		push('hl_market_data', 'fail', `Market data fetch failed: ${e.message}`);
	}

	try {
		const equity = await hl.getAccountValueUsd();
		const positions = await hl.getPositions();
		push('hl_balance', equity > 5 ? 'ok' : 'warn', `Equity: $${equity.toFixed(2)} | Open positions: ${positions.length}`);
	} catch (e: any) {
		push('hl_balance', 'fail', `Balance/position fetch failed: ${e.message}`);
	}

	return checks;
}
