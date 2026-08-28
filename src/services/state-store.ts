import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { PositionStateMap } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists PositionStateMap to `position_state` in the shared sentinel.db.
 * `save()` keeps the same "whole-map overwrite" contract the old JSON file
 * had (state is tiny - one row per mirrored trade - and every write follows
 * a real order, so a crash between order and save is the only real risk,
 * not write performance): delete-all-then-reinsert, wrapped in a
 * transaction so it's atomic, unlike the old plain writeFileSync.
 */
export class StateStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger,
	) {
		this.db = openDb(path);
	}

	load(): PositionStateMap {
		try {
			const rows = this.db.prepare('SELECT * FROM position_state').all() as any[];
			const map: PositionStateMap = {};
			for (const r of rows) {
				map[r.base_id] = {
					coin: r.coin,
					isBuy: !!r.is_buy,
					leverage: r.leverage,
					marginUsd: r.margin_usd,
					ourBaseShortId: r.our_base_short_id,
					portfolioId: r.portfolio_id ?? undefined,
					portfolioTitle: r.portfolio_title ?? undefined,
					ownerUsername: r.owner_username ?? undefined,
					entryPrice: r.entry_price ?? undefined,
					openedAt: r.opened_at ?? undefined,
					lastAppliedFraction: r.last_applied_fraction ?? undefined,
					traderModeInvoBaseId: r.trader_mode_invo_base_id ?? undefined,
					traderModeEntrySim: r.trader_mode_entry_sim ?? undefined,
				};
			}
			return map;
		} catch (e: any) {
			this.log({ type: 'error', source: 'state_store_load', message: e.message });
			return {};
		}
	}

	save(state: PositionStateMap): void {
		try {
			const insert = this.db.prepare(
				`INSERT INTO position_state (base_id, coin, is_buy, leverage, margin_usd, our_base_short_id, portfolio_id, owner_username, entry_price, opened_at, last_applied_fraction, trader_mode_invo_base_id, trader_mode_entry_sim, portfolio_title)
				 VALUES (@baseId, @coin, @isBuy, @leverage, @marginUsd, @ourBaseShortId, @portfolioId, @ownerUsername, @entryPrice, @openedAt, @lastAppliedFraction, @traderModeInvoBaseId, @traderModeEntrySim, @portfolioTitle)`,
			);
			const tx = this.db.transaction((s: PositionStateMap) => {
				this.db.prepare('DELETE FROM position_state').run();
				for (const [baseId, e] of Object.entries(s)) {
					insert.run({
						baseId,
						coin: e.coin,
						isBuy: e.isBuy ? 1 : 0,
						leverage: e.leverage,
						marginUsd: e.marginUsd,
						ourBaseShortId: e.ourBaseShortId,
						portfolioId: e.portfolioId ?? null,
						ownerUsername: e.ownerUsername ?? null,
						entryPrice: e.entryPrice ?? null,
						openedAt: e.openedAt ?? null,
						lastAppliedFraction: e.lastAppliedFraction ?? null,
						traderModeInvoBaseId: e.traderModeInvoBaseId ?? null,
						traderModeEntrySim: e.traderModeEntrySim ?? null,
						portfolioTitle: e.portfolioTitle ?? null,
					});
				}
			});
			tx(state);
		} catch (e: any) {
			this.log({ type: 'error', source: 'state_store_save', message: e.message });
		}
	}
}
