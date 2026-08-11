import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { FollowedPortfolio } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists the daemon's own already-fetched followed-portfolios list to
 * `.copy-followed-portfolios.json`, machine-only, overwritten every cycle -
 * so the dashboard UI can read it instead of calling Invo's API itself.
 * Confirmed live 2026-08-11: the UI had its own independent InvoClient
 * hitting the same account/token as the daemon, so it shared the exact
 * same per-account rate-limit budget with no cache and no timeout; when a
 * follow-spree (5→10 portfolios in ~16min) tripped Invo's rate limit, the
 * UI's right-rail widget hung for however long the daemon's retry-after
 * backoff took, on every page navigation, since it re-fetched fresh every
 * time. Reading this file instead removes the UI as an Invo caller
 * entirely - it can only ever be as stale as the daemon's own last cycle
 * (a few seconds), and never blocks on Invo being slow or rate-limited.
 */
export class FollowedPortfoliosStore {
	constructor(
		private path: string,
		private log: Logger,
	) {}

	load(): FollowedPortfolio[] {
		if (!existsSync(this.path)) return [];
		try {
			return JSON.parse(readFileSync(this.path, 'utf8'));
		} catch {
			return [];
		}
	}

	save(portfolios: FollowedPortfolio[]): void {
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			writeFileSync(this.path, JSON.stringify(portfolios, null, 2));
		} catch (e: any) {
			this.log({ type: 'error', source: 'followed_portfolios_store_save', message: e.message });
		}
	}
}
