import type { AppConfig } from '@daemon/config/env.js';
import { loadConfig } from '@daemon/config/env.js';
import dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at ui/server/daemon/paths.ts, so the repo root is three levels up.
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

dotenv.config({ path: join(REPO_ROOT, '.env') });

export const STATE_PATH = join(REPO_ROOT, 'data/.copy-state.json');
export const IGNORED_PATH = join(REPO_ROOT, 'data/.copy-ignored.json');
export const PORTFOLIO_RISK_PATH = join(REPO_ROOT, 'data/.copy-portfolio-risk.json');
export const LOGS_DIR = join(REPO_ROOT, 'logs');

let cachedConfig: AppConfig | null = null;

/** Module-scope singleton; Next.js dev hot-reload may re-invoke this module, which is an acceptable caveat for a dev-only dashboard. */
export function getAppConfig(): AppConfig {
	if (!cachedConfig) cachedConfig = loadConfig();
	return cachedConfig;
}
