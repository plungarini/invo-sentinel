import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { PositionStateMap } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists PositionStateMap to a single JSON file. Deliberately tiny and
 * synchronous; state is small (one entry per mirrored trade) and every
 * write follows a real order, so a crash between order and save is the
 * only real risk, not write performance.
 */
export class StateStore {
	constructor(
		private path: string,
		private log: Logger,
	) {}

	load(): PositionStateMap {
		if (!existsSync(this.path)) return {};
		try {
			return JSON.parse(readFileSync(this.path, 'utf8'));
		} catch {
			return {};
		}
	}

	save(state: PositionStateMap): void {
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			writeFileSync(this.path, JSON.stringify(state, null, 2));
		} catch (e: any) {
			this.log({ type: 'error', source: 'state_store_save', message: e.message });
		}
	}
}
