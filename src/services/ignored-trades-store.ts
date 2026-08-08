import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { IgnoredTradesMap } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists IgnoredTradesMap to its own JSON file, separate from
 * PositionStateMap: these baseIds were never opened, so they must never be
 * touched by the close-detection loop in Reconciler.run(), which walks
 * tracked *positions* and issues real Hyperliquid closes for anything no
 * longer in a trader's open list.
 */
export class IgnoredTradesStore {
	constructor(
		private path: string,
		private log: Logger,
	) {}

	load(): IgnoredTradesMap {
		if (!existsSync(this.path)) return {};
		try {
			return JSON.parse(readFileSync(this.path, 'utf8'));
		} catch {
			return {};
		}
	}

	save(ignored: IgnoredTradesMap): void {
		try {
			writeFileSync(this.path, JSON.stringify(ignored, null, 2));
		} catch (e: any) {
			this.log({ type: 'error', source: 'ignored_trades_store_save', message: e.message });
		}
	}
}
