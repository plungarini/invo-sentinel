import 'dotenv/config';
import type { ConfigStore } from '../services/config-store.js';
import type { RiskConfig } from '../types.js';
import type { StaleEntryConfig } from '../services/stale-entry-policy.js';

export interface AppConfig {
	/** False until all 3 required secrets resolve from either the DB or `.env` - a normal boot state, not an error. */
	configured: boolean;
	/** Required env var names still missing (DB and `.env` both empty), empty when `configured` is true. */
	missing: string[];
	invoRefreshToken: string;
	hlAgentKey: string;
	walletAddress: string;
	risk: RiskConfig;
	staleEntry: StaleEntryConfig;
	pollIntervalMs: number;
	logRetentionHours: number;
	logMaxTotalMb: number;
	/** Optional external monitoring ping (e.g. healthchecks.io), fired after every poll cycle. Unset = disabled. */
	healthcheckPingUrl?: string;
}

export const DEFAULT_LOG_RETENTION_HOURS = 24;
export const DEFAULT_LOG_MAX_TOTAL_MB = 200;

function parsePercent(raw: string | undefined, fallback: number): number {
	const n = parseFloat(raw ?? '');
	return Number.isFinite(n) ? n / 100 : fallback;
}

/**
 * DB row presence wins once set (what makes the setup wizard/settings page
 * mean anything) - `.env` is the fallback only when there's no row at all,
 * not when the row's value happens to be falsy/empty. An explicit blank
 * (e.g. clearing "Max leverage" on the settings page, whose own hint reads
 * "blank = no cap") must actually override a non-blank `.env` value rather
 * than falling through to it; the settings-page write side must write `''`
 * for "cleared", never delete the row, or this check can't tell "cleared"
 * apart from "never configured".
 */
function readValue(stored: Record<string, string>, dbKey: string, envKey: string): string {
	if (dbKey in stored) return stored[dbKey];
	return process.env[envKey] || '';
}

/**
 * Reads just the margin risk band - split out from `loadConfig` so
 * `Reconciler.run()` can re-resolve it fresh every cycle (a settings-page
 * edit takes effect on the next cycle, not just at boot) without paying for
 * a full config read/validation on every other field too. CLI positional
 * overrides, if provided, still take precedence over both DB and `.env`.
 */
export function loadRiskConfig(
	configStore: ConfigStore,
	overrides: { minMarginPct?: number; maxMarginPct?: number } = {},
): RiskConfig {
	const stored = configStore.load();
	const minMarginPct = overrides.minMarginPct ?? parsePercent(readValue(stored, 'minMarginPct', 'MIN_MARGIN_PCT'), 0.02);
	const maxMarginPct = overrides.maxMarginPct ?? parsePercent(readValue(stored, 'maxMarginPct', 'MAX_MARGIN_PCT'), 0.05);
	if (minMarginPct < 0 || maxMarginPct < minMarginPct) {
		throw new Error(`Invalid risk band: min=${minMarginPct * 100}% max=${maxMarginPct * 100}%`);
	}

	const maxLeverageRaw = parseFloat(readValue(stored, 'maxLeverage', 'MAX_LEVERAGE'));

	return {
		minMarginPct,
		maxMarginPct,
		maxLeverage: Number.isFinite(maxLeverageRaw) ? maxLeverageRaw : undefined,
	};
}

/**
 * Loads and validates config from `ConfigStore` (sentinel.db), falling back
 * to `process.env`/`.env` for anything not yet set in the DB. Async so a
 * future `ConfigStore` backend needing real I/O doesn't force another
 * signature change - `ConfigStore` itself is synchronous SQLite today.
 * Returns a "not configured yet" state instead of throwing when required
 * secrets are missing from both sources - that's a normal first-run state
 * now, not a fatal error; callers decide what to do with `configured: false`.
 * CLI positional args for min/max margin %, if provided by the caller, take
 * precedence over both DB and `.env`; pass them in as overrides.
 */
export async function loadConfig(
	configStore: ConfigStore,
	overrides: { minMarginPct?: number; maxMarginPct?: number } = {},
): Promise<AppConfig> {
	const stored = configStore.load();

	const invoRefreshToken = readValue(stored, 'invoRefreshToken', 'INVO_REFRESH_TOKEN');
	const hlAgentKey = readValue(stored, 'hlAgentKey', 'HL_AGENT_KEY');
	const walletAddress = readValue(stored, 'walletAddress', 'WALLET_ADDRESS');

	const missing: string[] = [];
	if (!invoRefreshToken) missing.push('INVO_REFRESH_TOKEN');
	if (!hlAgentKey) missing.push('HL_AGENT_KEY');
	if (!walletAddress) missing.push('WALLET_ADDRESS');

	const risk = loadRiskConfig(configStore, overrides);

	return {
		configured: missing.length === 0,
		missing,
		invoRefreshToken,
		hlAgentKey,
		walletAddress,
		risk,
		staleEntry: {
			maxAgeMinutes: parseFloat(readValue(stored, 'staleEntryMaxAgeMinutes', 'STALE_ENTRY_MAX_AGE_MINUTES')) || 1,
			maxProfitPct: parseFloat(readValue(stored, 'staleEntryMaxProfitPct', 'STALE_ENTRY_MAX_PROFIT_PCT')) || 1,
		},
		pollIntervalMs: parseInt(readValue(stored, 'pollIntervalMs', 'POLL_INTERVAL_MS'), 10) || 5_000,
		logRetentionHours: parseFloat(readValue(stored, 'logRetentionHours', 'LOG_RETENTION_HOURS')) || DEFAULT_LOG_RETENTION_HOURS,
		logMaxTotalMb: parseFloat(readValue(stored, 'logMaxTotalMb', 'LOG_MAX_TOTAL_MB')) || DEFAULT_LOG_MAX_TOTAL_MB,
		healthcheckPingUrl: readValue(stored, 'healthcheckPingUrl', 'HEALTHCHECK_PING_URL') || undefined,
	};
}
