import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { IgnoredTradesMap } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists IgnoredTradesMap to `ignored_trades` in the shared sentinel.db,
 * its own table - separate from `position_state`: these baseIds were never
 * opened, so they must never be touched by the close-detection loop in
 * Reconciler.run(), which walks tracked *positions* and issues real
 * Hyperliquid closes for anything no longer in a trader's open list.
 */
export class IgnoredTradesStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger,
	) {
		this.db = openDb(path);
	}

	load(): IgnoredTradesMap {
		try {
			const rows = this.db.prepare('SELECT * FROM ignored_trades').all() as any[];
			const map: IgnoredTradesMap = {};
			for (const r of rows) {
				map[r.base_id] = {
					coin: r.coin,
					portfolioId: r.portfolio_id ?? undefined,
					reason: r.reason,
					ignoredAt: r.ignored_at,
				};
			}
			return map;
		} catch (e: any) {
			this.log({ type: 'error', source: 'ignored_trades_store_load', message: e.message });
			return {};
		}
	}

	save(ignored: IgnoredTradesMap): void {
		try {
			const insert = this.db.prepare(
				`INSERT INTO ignored_trades (base_id, coin, portfolio_id, reason, ignored_at) VALUES (@baseId, @coin, @portfolioId, @reason, @ignoredAt)`,
			);
			const tx = this.db.transaction((s: IgnoredTradesMap) => {
				this.db.prepare('DELETE FROM ignored_trades').run();
				for (const [baseId, e] of Object.entries(s)) {
					insert.run({ baseId, coin: e.coin, portfolioId: e.portfolioId ?? null, reason: e.reason, ignoredAt: e.ignoredAt });
				}
			});
			tx(ignored);
		} catch (e: any) {
			this.log({ type: 'error', source: 'ignored_trades_store_save', message: e.message });
		}
	}
}
