import type { Database } from 'better-sqlite3';
import { openDb } from './db.js';
import type { Logger } from './logger.js';

const REQUIRED_KEYS = ['invoRefreshToken', 'hlAgentKey', 'walletAddress'] as const;

/**
 * Persists runtime config (secrets + tuning vars) to `app_config` in the
 * shared sentinel.db - key/value rows, not one blob, so a partial write
 * from a settings-page save can't clobber unrelated keys. `log` defaults to
 * a no-op because this store has to exist before `loadConfig()` resolves,
 * and the daemon's own logger is itself built from config values
 * (log retention/size) - call `setLogger` once the real logger exists.
 */
export class ConfigStore {
	private db: Database;

	constructor(
		private path: string,
		private log: Logger = () => {},
	) {
		this.db = openDb(path);
	}

	setLogger(log: Logger): void {
		this.log = log;
	}

	/**
	 * Deliberately does NOT catch - unlike every other `*-store.ts load()` in
	 * this codebase, a swallowed failure here doesn't just mean stale/empty
	 * state, it means `loadRiskConfig()` (called fresh every cycle, not just
	 * at boot) would silently fall back to the 2%/5% default band instead of
	 * whatever's actually configured, and `PositionSync`'s incremental
	 * targeting would read that as a real fraction change and place real
	 * resize orders on every tracked position. `auto-copy.ts`'s per-cycle
	 * try/catch already handles a thrown error correctly (log, ping fail,
	 * retry next cycle); the first `reconciler.run()` at boot is deliberately
	 * outside that try, so a read failure there still exits non-zero instead
	 * of starting the daemon on a wrong band.
	 */
	load(): Record<string, string> {
		const rows = this.db.prepare('SELECT key, value FROM app_config').all() as { key: string; value: string }[];
		return Object.fromEntries(rows.map((r) => [r.key, r.value]));
	}

	get(key: string): string | undefined {
		return this.load()[key];
	}

	set(key: string, value: string): void {
		try {
			this.db
				.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
				.run(key, value);
		} catch (e: any) {
			this.log({ type: 'error', source: 'config_store_set', message: e.message, key });
		}
	}

	setMany(entries: Record<string, string>): void {
		try {
			const tx = this.db.transaction((e: Record<string, string>) => {
				const upsert = this.db.prepare(
					`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
				);
				for (const [k, v] of Object.entries(e)) upsert.run(k, v);
			});
			tx(entries);
		} catch (e: any) {
			this.log({ type: 'error', source: 'config_store_set_many', message: e.message });
		}
	}

	delete(key: string): void {
		try {
			this.db.prepare('DELETE FROM app_config WHERE key = ?').run(key);
		} catch (e: any) {
			this.log({ type: 'error', source: 'config_store_delete', message: e.message, key });
		}
	}

	/**
	 * Whether the 3 required secrets are set IN THE DB specifically - NOT
	 * `loadConfig()`'s `configured` flag, which also returns true for an
	 * existing Pi/Docker deployment relying purely on `.env`. The setup
	 * wizard's "do I need to show the wizard" check must key off this one,
	 * or a `.env`-only user would see an unnecessary wizard on every launch.
	 */
	hasRequiredSecretsInDb(): boolean {
		const stored = this.load();
		return REQUIRED_KEYS.every((k) => !!stored[k]);
	}
}
