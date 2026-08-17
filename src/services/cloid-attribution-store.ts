import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { CloidAttributionCache } from '../types.js';
import type { Logger } from './logger.js';

/** Persists CloidAttributionCache to `cloid_attribution_cache` in the shared sentinel.db - avoids re-fetching userFills/re-calling /dex/trade every cycle for a coin already resolved (or confirmed genuinely manual) via cloid decoding. */
export class CloidAttributionStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger,
	) {
		this.db = openDb(path);
	}

	load(): CloidAttributionCache {
		try {
			const rows = this.db.prepare('SELECT * FROM cloid_attribution_cache').all() as any[];
			const cache: CloidAttributionCache = {};
			for (const r of rows) {
				cache[r.coin] =
					r.kind === 'resolved'
						? {
								kind: 'resolved',
								checkedAt: r.checked_at,
								positionSize: r.position_size,
								baseShortId: r.base_short_id,
								investmentBaseId: r.investment_base_id,
								portfolioId: r.portfolio_id,
								trader: r.trader ?? undefined,
							}
						: { kind: 'manual', checkedAt: r.checked_at, positionSize: r.position_size };
			}
			return cache;
		} catch (e: any) {
			this.log({ type: 'error', source: 'cloid_attribution_store_load', message: e.message });
			return {};
		}
	}

	save(cache: CloidAttributionCache): void {
		try {
			const insert = this.db.prepare(
				`INSERT INTO cloid_attribution_cache (coin, kind, checked_at, position_size, base_short_id, investment_base_id, portfolio_id, trader)
				 VALUES (@coin, @kind, @checkedAt, @positionSize, @baseShortId, @investmentBaseId, @portfolioId, @trader)`,
			);
			const tx = this.db.transaction((c: CloidAttributionCache) => {
				this.db.prepare('DELETE FROM cloid_attribution_cache').run();
				for (const [coin, e] of Object.entries(c)) {
					insert.run({
						coin,
						kind: e.kind,
						checkedAt: e.checkedAt,
						positionSize: e.positionSize,
						baseShortId: e.kind === 'resolved' ? e.baseShortId : null,
						investmentBaseId: e.kind === 'resolved' ? e.investmentBaseId : null,
						portfolioId: e.kind === 'resolved' ? e.portfolioId : null,
						trader: e.kind === 'resolved' ? (e.trader ?? null) : null,
					});
				}
			});
			tx(cache);
		} catch (e: any) {
			this.log({ type: 'error', source: 'cloid_attribution_store_save', message: e.message });
		}
	}
}
