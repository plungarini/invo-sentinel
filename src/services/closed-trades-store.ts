import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { ClosedTradeRecord } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Durable, append-only history of fully-closed mirrored trades, persisted
 * to `closed_trades` in the shared sentinel.db - see `ClosedTradeRecord` in
 * types.ts for why this table (not `position_state`) is what survives a
 * portfolio unfollow. Unlike the other stores, this is never `load()`ed
 * wholesale into memory and diffed back - each close is `record()`ed once,
 * individually, at the moment it happens.
 */
export class ClosedTradesStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger,
	) {
		this.db = openDb(path);
	}

	record(entry: ClosedTradeRecord): void {
		try {
			this.db
				.prepare(
					`INSERT INTO closed_trades (base_id, coin, is_buy, leverage, margin_usd, portfolio_id, portfolio_title, owner_username, entry_price, closing_price, opened_at, closed_at, close_reason)
					 VALUES (@baseId, @coin, @isBuy, @leverage, @marginUsd, @portfolioId, @portfolioTitle, @ownerUsername, @entryPrice, @closingPrice, @openedAt, @closedAt, @closeReason)`,
				)
				.run({
					baseId: entry.baseId,
					coin: entry.coin,
					isBuy: entry.isBuy ? 1 : 0,
					leverage: entry.leverage ?? null,
					marginUsd: entry.marginUsd ?? null,
					portfolioId: entry.portfolioId ?? null,
					portfolioTitle: entry.portfolioTitle ?? null,
					ownerUsername: entry.ownerUsername ?? null,
					entryPrice: entry.entryPrice ?? null,
					closingPrice: entry.closingPrice ?? null,
					openedAt: entry.openedAt ?? null,
					closedAt: entry.closedAt,
					closeReason: entry.closeReason,
				});
		} catch (e: any) {
			this.log({ type: 'error', source: 'closed_trades_store_record', message: e.message });
		}
	}

	list(): ClosedTradeRecord[] {
		try {
			const rows = this.db.prepare('SELECT * FROM closed_trades ORDER BY closed_at DESC').all() as any[];
			return rows.map(fromRow);
		} catch (e: any) {
			this.log({ type: 'error', source: 'closed_trades_store_list', message: e.message });
			return [];
		}
	}

	/** Most recent closed record for a baseId, if any - baseIds are one-shot (a new trade always gets a fresh baseId), so there's at most one real match; DESC + LIMIT 1 is defensive, not load-bearing. */
	getByBaseId(baseId: string): ClosedTradeRecord | undefined {
		try {
			const row = this.db.prepare('SELECT * FROM closed_trades WHERE base_id = ? ORDER BY closed_at DESC LIMIT 1').get(baseId) as any;
			return row ? fromRow(row) : undefined;
		} catch (e: any) {
			this.log({ type: 'error', source: 'closed_trades_store_get', message: e.message });
			return undefined;
		}
	}
}

function fromRow(r: any): ClosedTradeRecord {
	return {
		baseId: r.base_id,
		coin: r.coin,
		isBuy: !!r.is_buy,
		leverage: r.leverage ?? undefined,
		marginUsd: r.margin_usd ?? undefined,
		portfolioId: r.portfolio_id ?? undefined,
		portfolioTitle: r.portfolio_title ?? undefined,
		ownerUsername: r.owner_username ?? undefined,
		entryPrice: r.entry_price ?? undefined,
		closingPrice: r.closing_price ?? undefined,
		openedAt: r.opened_at ?? undefined,
		closedAt: r.closed_at,
		closeReason: r.close_reason,
	};
}
