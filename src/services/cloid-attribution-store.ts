import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { CloidAttributionCache } from '../types.js';
import type { Logger } from './logger.js';

/** Persists CloidAttributionCache - avoids re-fetching userFills/re-calling /dex/trade every cycle for a coin already resolved (or confirmed genuinely manual) via cloid decoding. */
export class CloidAttributionStore {
	constructor(
		private path: string,
		private log: Logger,
	) {}

	load(): CloidAttributionCache {
		if (!existsSync(this.path)) return {};
		try {
			return JSON.parse(readFileSync(this.path, 'utf8'));
		} catch {
			return {};
		}
	}

	save(cache: CloidAttributionCache): void {
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			writeFileSync(this.path, JSON.stringify(cache, null, 2));
		} catch (e: any) {
			this.log({ type: 'error', source: 'cloid_attribution_store_save', message: e.message });
		}
	}
}
