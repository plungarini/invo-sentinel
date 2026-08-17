import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { FollowedPortfolio } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists the daemon's own already-fetched followed-portfolios list to
 * `followed_portfolios` in the shared sentinel.db, machine-only, overwritten
 * every cycle - so the dashboard UI can read it instead of calling Invo's
 * API itself. Confirmed live 2026-08-11: the UI had its own independent
 * InvoClient hitting the same account/token as the daemon, so it shared the
 * exact same per-account rate-limit budget with no cache and no timeout;
 * when a follow-spree (5→10 portfolios in ~16min) tripped Invo's rate
 * limit, the UI's right-rail widget hung for however long the daemon's
 * retry-after backoff took, on every page navigation, since it re-fetched
 * fresh every time. Reading this table instead removes the UI as an Invo
 * caller entirely - it can only ever be as stale as the daemon's own last
 * cycle (a few seconds), and never blocks on Invo being slow or
 * rate-limited. Stored as a JSON blob per row (not normalized columns)
 * since the whole point is round-tripping Invo's own shape unchanged.
 */
export class FollowedPortfoliosStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger,
	) {
		this.db = openDb(path);
	}

	load(): FollowedPortfolio[] {
		try {
			const rows = this.db.prepare('SELECT data FROM followed_portfolios').all() as { data: string }[];
			return rows.map((r) => JSON.parse(r.data));
		} catch (e: any) {
			this.log({ type: 'error', source: 'followed_portfolios_store_load', message: e.message });
			return [];
		}
	}

	save(portfolios: FollowedPortfolio[]): void {
		try {
			const insert = this.db.prepare(`INSERT INTO followed_portfolios (id, data) VALUES (?, ?)`);
			const tx = this.db.transaction((list: FollowedPortfolio[]) => {
				this.db.prepare('DELETE FROM followed_portfolios').run();
				for (const p of list) insert.run(p.id, JSON.stringify(p));
			});
			tx(portfolios);
		} catch (e: any) {
			this.log({ type: 'error', source: 'followed_portfolios_store_save', message: e.message });
		}
	}
}
