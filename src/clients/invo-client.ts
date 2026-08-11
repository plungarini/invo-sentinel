import { SlowCallTracker } from '../services/call-timing.js';
import '../services/http-dispatcher.js';
import type { ClosedInvestment, FollowedPortfolio, OpenInvestment } from '../types.js';

const BASE = 'https://api.invoapp.com';
const MAX_RATE_LIMIT_RETRIES = 3;
// A hung connection here (no timeout) blocks the whole reconcile cycle
// indefinitely with nothing ever thrown - silent, no error log, no crash,
// just no forward progress. Bounded so a stall becomes an ordinary
// catchable error instead, retried next cycle.
//
// Manual AbortController rather than the `AbortSignal.timeout()` shorthand
// deliberately: undici can reuse a keep-alive socket the remote already
// closed and hang from deep inside its own connection-pool state machine,
// a path `AbortSignal.timeout()` doesn't reliably reach (see
// http-dispatcher.ts, imported above for its side effect of shortening
// keep-alive so this is rare in the first place).
const INVO_FETCH_TIMEOUT_MS = 15_000;

function withAbortTimeout(ms: number, label: string): { signal: AbortSignal; clear: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${ms}ms`)), ms);
	return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

export interface RecordOpenPayload {
	clientTxId: string;
	coin: string;
	assetIndex: number;
	entry: {
		side: 'long' | 'short';
		marginMode: 'isolated' | 'cross';
		leverage: number;
		tpPx: string | null;
		slPx: string | null;
	};
	submission: { hlOrder: unknown; nonceMs: number; hlResponse: unknown };
	summary: { qtyBefore: string; qtyAfter: string; intendedLeverage: number };
	mimicMeta: {
		portfolioId: string;
		creatorInvoUserId: string;
		initialSourcePaperUpdateId: string;
		sourcePaperTradeBaseId: string;
	};
}

export interface RecordClosePayload {
	clientTxId: string;
	baseShortId: string;
	assetIndex: number;
	submission: { hlOrder: unknown; nonceMs: number; hlResponse: unknown };
	summary: { qtyBefore: string; qtyAfter: string };
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared by both the followed-list and get-by-id endpoints - same raw `portfolio` object shape either way. */
function mapPortfolio(portfolio: any): FollowedPortfolio {
	return {
		id: portfolio.id,
		title: portfolio.title,
		description: portfolio.description,
		ownerId: portfolio.ownerId,
		ownerUsername: portfolio.owner?.username,
		ownerName: portfolio.owner?.name,
		ownerVerified: portfolio.owner?.verified,
		ownerAvatarUrl: portfolio.owner?.ownerAvatarUrl,
		ownerAvatarColor: portfolio.owner?.ownerAvatarColor,
		winRate: portfolio.winRate,
		wonPositions: portfolio.wonPositions,
		lostPositions: portfolio.lostPositions,
		closedPositions: portfolio.closedPositions,
		openPositions: portfolio.openPositions,
		followerCount: portfolio.followerCount,
		currentWinStreak: portfolio.currentWinStreak,
		plSnapshot: portfolio.plSnapshot,
		avgPlRealized: portfolio.avgPlRealized,
		avgHoldTimeSeconds: portfolio.avgHoldTimeSeconds,
		liquidated: portfolio.liquidated,
	};
}

/**
 * Thin wrapper around Invo's reverse-engineered REST API; just the
 * endpoints this project actually calls. Auth is a long-lived refresh
 * token traded for short-lived (~10 min) access tokens, refreshed
 * automatically on expiry or a 401.
 *
 * Source of truth for followed-trader position state is
 * get_investments(isOpen: true) per portfolio; NOT the social feed
 * (posts/get_feed). The feed has an inherent 1-10s propagation delay and a
 * confirmed server-side pagination bug beyond ~page 8 ("wrong number of
 * arguments for 'lpush' command"), so it's unusable for reliably
 * discovering already-open positions. This client doesn't implement the
 * feed endpoint at all.
 */
export class InvoClient {
	private accessToken = '';
	private slowCalls = new SlowCallTracker('invo');

	constructor(private refreshToken: string) {}

	drainSlowCalls() {
		return this.slowCalls.drain();
	}

	private getUserId(): string {
		const raw = (this.accessToken || this.refreshToken).replace('Bearer ', '');
		const payload = JSON.parse(atob(raw.split('.')[1]));
		return payload.user_id;
	}

	private async refreshAccessToken(): Promise<boolean> {
		return this.slowCalls.track('/v1_0/auth/refresh_token', async () => {
			const { signal, clear } = withAbortTimeout(INVO_FETCH_TIMEOUT_MS, 'Invo refresh_token');
			try {
				const resp = await fetch(`${BASE}/v1_0/auth/refresh_token`, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${this.refreshToken}`,
						'x-app-version': '0.0.75',
						'x-platform': 'web',
					},
					signal,
				});
				if (resp.status !== 200) return false;
				const data = await resp.json();
				if (data.accessToken) {
					this.accessToken = `Bearer ${data.accessToken}`;
					return true;
				}
				return false;
			} catch {
				return false;
			} finally {
				clear();
			}
		});
	}

	private async ensureToken(): Promise<void> {
		if (this.accessToken) {
			try {
				const payload = JSON.parse(atob(this.accessToken.replace('Bearer ', '').split('.')[1]));
				const remainingSec = payload.expires - Date.now() / 1000;
				if (remainingSec > 30) return; // still valid
			} catch {
				/* can't decode; fall through to refresh */
			}
		}
		const ok = await this.refreshAccessToken();
		if (!ok && !this.accessToken) throw new Error('No valid Invo access token and refresh failed');
	}

	/** Checks the refresh token itself is well-formed and not expired. Used by preflight. */
	refreshTokenDaysRemaining(): number {
		const payload = JSON.parse(atob(this.refreshToken.split('.')[1]));
		return (payload.expires - Date.now() / 1000) / 86_400;
	}

	private async post(path: string, body: unknown, retriedAuth = false, rateLimitAttempt = 0): Promise<any> {
		await this.ensureToken();
		const resp = await this.slowCalls.track(path, async () => {
			const { signal, clear } = withAbortTimeout(INVO_FETCH_TIMEOUT_MS, `Invo ${path}`);
			try {
				return await fetch(`${BASE}${path}`, {
					method: 'POST',
					headers: {
						Authorization: this.accessToken,
						'Content-Type': 'application/json',
						'x-app-version': '0.0.75',
						'x-platform': 'web',
					},
					body: JSON.stringify(body),
					signal,
				});
			} finally {
				clear();
			}
		});

		const text = await resp.text();
		let data: any;
		try {
			data = JSON.parse(text);
		} catch {
			// Some Invo responses are base64-encoded JSON.
			try {
				data = JSON.parse(atob(text));
			} catch {
				data = text;
			}
		}

		if (resp.status === 401 && !retriedAuth) {
			const ok = await this.refreshAccessToken();
			if (ok) return this.post(path, body, true, rateLimitAttempt);
		}

		if (resp.status === 429 && rateLimitAttempt < MAX_RATE_LIMIT_RETRIES) {
			const retryAfterHeader = resp.headers.get('retry-after');
			const delayMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : 1000 * 2 ** rateLimitAttempt;
			await sleep(Number.isFinite(delayMs) ? delayMs : 1000 * 2 ** rateLimitAttempt);
			return this.post(path, body, retriedAuth, rateLimitAttempt + 1);
		}

		if (resp.status >= 400) {
			throw new Error(`Invo ${path} ${resp.status}: ${JSON.stringify(data)}`);
		}
		return data;
	}

	async getFollowedPortfolios(): Promise<FollowedPortfolio[]> {
		const data = await this.post('/v1_0/portfolios/get_users_followed_portfolios', {
			context: { filter: 'following' },
			userId: this.getUserId(),
			params: { sinceTimestamp: 0, size: 100 },
		});
		return (data.savedPortfolios ?? []).map((sp: any) => mapPortfolio(sp.portfolio));
	}

	/**
	 * Any portfolio by id, followed or not - confirmed live 2026-08-11 by
	 * tracing app.invoapp.com's own network calls on a portfolio profile page
	 * (`/v1_0/portfolios/*`/`/dex/portfolio` guesses had all 404'd). Same
	 * `portfolio` object shape as `get_users_followed_portfolios`, plus
	 * `isFollowing` - this is what Invo's own public "Discover" browsing uses.
	 */
	async getPortfolioById(portfolioId: string): Promise<FollowedPortfolio & { isFollowing: boolean }> {
		const data = await this.post('/v1_0/portfolios/get_portfolio_by_id', { portfolioId });
		return { ...mapPortfolio(data.portfolio), isFollowing: !!data.portfolio?.isFollowing };
	}

	async getOpenInvestments(portfolioId: string): Promise<OpenInvestment[]> {
		const data = await this.post('/v1_0/investments/get_investments', {
			portfolioId,
			isOpen: true,
			params: { page: 1, size: 50 },
		});
		return (data.investmentsTicker ?? []) as OpenInvestment[];
	}

	/**
	 * The trader's own closed-trade history - includes `closedAt`,
	 * `closingPrice`, `reasonClosed` not present on open investments.
	 * NOT used by the live reconciler (source of truth for what to mirror
	 * is still isOpen:true); this is for reconciliation/auditing only, to
	 * check what a trader actually did against what this daemon did.
	 */
	async getClosedInvestments(portfolioId: string, page = 1, size = 20): Promise<ClosedInvestment[]> {
		const data = await this.post('/v1_0/investments/get_investments', {
			portfolioId,
			isOpen: false,
			params: { page, size },
		});
		return (data.investmentsTicker ?? []) as ClosedInvestment[];
	}

	/**
	 * Status/history for investments you're already (or might be) mimicking,
	 * keyed by the TRADER's baseShortId; not yours. Used experimentally to
	 * test whether it can positively confirm "you are mimicking this one"
	 * for same-coin conflict resolution; see probe-btc.ts.
	 */
	async getTradeStatus(investments: { baseShortId: string; mimicStartedAt: string }[]): Promise<any> {
		return this.post('/dex/trade', { investments });
	}

	async recordOpen(payload: RecordOpenPayload): Promise<any> {
		return this.post('/dex/position/create', payload);
	}

	async recordClose(payload: RecordClosePayload): Promise<any> {
		return this.post('/dex/position/close', payload);
	}
}
