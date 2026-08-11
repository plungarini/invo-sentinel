// Confirmed live 2026-08-11 via a direct probe against Invo's own API: a 429
// on api.invoapp.com carries `ratelimit-policy: 500;w=300` (Cloudflare) and
// `Too many requests from this IP` - an IP-scoped budget, not per-account.
// Each reconcile cycle makes 1 + N Invo calls (the followed-portfolios list,
// then one get_investments per followed portfolio); at N=14 that's already
// ~1.7-3 req/s against a 1.67 req/s sustained budget, before any retries -
// structurally over the limit forever at that follow count and POLL_INTERVAL_MS,
// not a transient blip that clears by waiting. This computes a floor on the
// gap between cycles that scales with how many portfolios are followed, so
// the daemon self-throttles instead of perpetually retrying into the same wall.
const INVO_RATE_LIMIT_PER_WINDOW = 500;
const INVO_RATE_LIMIT_WINDOW_MS = 300_000;
// Leaves headroom for mimic-resolver calls (conflict resolution) and other
// occasional Invo traffic (adopt/reconcile/preflight CLI runs, the account
// itself), which aren't counted in the per-cycle call estimate below.
const SAFETY_FACTOR = 0.6;

/**
 * Minimum safe gap between cycle starts given how many portfolios are
 * currently followed - always at least `pollIntervalMs`, but larger once
 * enough portfolios are followed that the naive interval would exceed
 * Invo's own rate limit on its own.
 */
export function computeSafePollIntervalMs(followedPortfolioCount: number, pollIntervalMs: number): number {
	const invoCallsPerCycle = 1 + followedPortfolioCount;
	const budgetPerMs = (INVO_RATE_LIMIT_PER_WINDOW * SAFETY_FACTOR) / INVO_RATE_LIMIT_WINDOW_MS;
	const minSafeIntervalMs = Math.ceil(invoCallsPerCycle / budgetPerMs);
	return Math.max(pollIntervalMs, minSafeIntervalMs);
}
