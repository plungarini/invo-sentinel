import type { AppConfig } from '@daemon/config/env.js';
import { loadConfig } from '@daemon/config/env.js';
import { ConfigStore } from '@daemon/services/config-store.js';
import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two different anchors, not one - a real bug found while building the
 * packaged release (`ui/next.config.ts`'s `output: 'standalone'` bundle):
 * `import.meta.url`-based arithmetic (this file lives 3 levels below the
 * repo root, so "go up 3") breaks once Next bundles this module for a
 * standalone server - the bundled chunk's real on-disk location isn't 3
 * levels below the repo root anymore, so "go up 3" silently overshot into
 * the ORIGINAL build machine's absolute checkout path baked in by the
 * bundler. Confirmed live: a standalone build copied to a totally unrelated
 * folder still loaded the *build machine's own* `.env` several directories
 * further up - the exact "looks fine on the build machine, silently wrong
 * everywhere else" failure this project already hit twice with the
 * compiled daemon (see `src/services/root-dir.ts`). `process.cwd()` is the
 * reliable signal instead - both dev (`npm run ui:dev`'s `--prefix ui` sets
 * cwd to `ui/`) and the packaged release (`start.bat`/`start.sh` `cd` into
 * `ui/` before running `node server.js`) guarantee cwd is this app's own
 * directory, so "one level up" is always where `.env` lives.
 *
 * Where `data/`/`logs/`/the DB itself live is a SEPARATE anchor, because
 * the daemon's own `resolveRootDir()` puts those inside `bin/` in the
 * packaged case (not the release root) but at the repo root directly in
 * dev - the UI has to match whichever one the daemon actually used, or it
 * reads/writes a different `sentinel.db` entirely. A `bin/` sibling folder
 * existing is the signal: packaging always creates it, a source checkout
 * never does.
 */
const ENV_ROOT = join(process.cwd(), '..');
const PACKAGED_BIN_DIR = join(ENV_ROOT, 'bin');
export const REPO_ROOT = existsSync(PACKAGED_BIN_DIR) ? PACKAGED_BIN_DIR : ENV_ROOT;

dotenv.config({ path: join(ENV_ROOT, '.env') });

// Shared sentinel.db (SQLite) holds everything the daemon itself writes
// machine-only; PORTFOLIO_RISK_PATH stays a plain JSON file on purpose -
// it's the one user-hand-edited store, see portfolio-risk-store.ts.
export const DB_PATH = join(REPO_ROOT, 'data/sentinel.db');
export const PORTFOLIO_RISK_PATH = join(REPO_ROOT, 'data/.copy-portfolio-risk.json');
export const LOGS_DIR = join(REPO_ROOT, 'logs');

let configStore: ConfigStore | null = null;

/** Module-scope singleton, same store instance the setup wizard/settings routes read and write. */
export function getConfigStore(): ConfigStore {
	if (!configStore) configStore = new ConfigStore(DB_PATH);
	return configStore;
}

let cachedConfig: AppConfig | null = null;

/**
 * Module-scope singleton; Next.js dev hot-reload may re-invoke this module,
 * which is an acceptable caveat for a dev-only dashboard. Not cached across
 * an unconfigured result - a wizard/settings write must be picked up on the
 * very next call, not after a restart.
 */
export async function getAppConfig(): Promise<AppConfig> {
	if (!cachedConfig) {
		const config = await loadConfig(getConfigStore());
		if (!config.configured) return config;
		cachedConfig = config;
	}
	return cachedConfig;
}

/** Called after a settings/wizard write so the next request re-resolves config instead of serving the pre-write cached copy. */
export function invalidateConfigCache(): void {
	cachedConfig = null;
}
