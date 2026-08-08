import 'dotenv/config';
import type { RiskConfig } from '../types.js';

export interface AppConfig {
	invoRefreshToken: string;
	hlAgentKey: string;
	walletAddress: string;
	risk: RiskConfig;
	pollIntervalMs: number;
	logRetentionHours: number;
	logMaxTotalMb: number;
}

function parsePercent(raw: string | undefined, fallback: number): number {
	const n = parseFloat(raw ?? '');
	return Number.isFinite(n) ? n / 100 : fallback;
}

/**
 * Loads and validates config from the environment. CLI positional args for
 * min/max margin %, if provided by the caller, take precedence over env ;
 * pass them in as overrides.
 */
export function loadConfig(overrides: { minMarginPct?: number; maxMarginPct?: number } = {}): AppConfig {
	const invoRefreshToken = process.env.INVO_REFRESH_TOKEN ?? '';
	const hlAgentKey = process.env.HL_AGENT_KEY ?? '';
	const walletAddress = process.env.WALLET_ADDRESS ?? '';

	const missing: string[] = [];
	if (!invoRefreshToken) missing.push('INVO_REFRESH_TOKEN');
	if (!hlAgentKey) missing.push('HL_AGENT_KEY');
	if (!walletAddress) missing.push('WALLET_ADDRESS');
	if (missing.length > 0) {
		throw new Error(`Missing required .env vars: ${missing.join(', ')}; see .env.example`);
	}

	const minMarginPct = overrides.minMarginPct ?? parsePercent(process.env.MIN_MARGIN_PCT, 0.02);
	const maxMarginPct = overrides.maxMarginPct ?? parsePercent(process.env.MAX_MARGIN_PCT, 0.05);
	if (minMarginPct < 0 || maxMarginPct < minMarginPct) {
		throw new Error(`Invalid risk band: min=${minMarginPct * 100}% max=${maxMarginPct * 100}%`);
	}

	const maxLeverageRaw = parseFloat(process.env.MAX_LEVERAGE ?? '');

	return {
		invoRefreshToken,
		hlAgentKey,
		walletAddress,
		risk: {
			minMarginPct,
			maxMarginPct,
			maxLeverage: Number.isFinite(maxLeverageRaw) ? maxLeverageRaw : undefined,
		},
		pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '', 10) || 5_000,
		logRetentionHours: parseFloat(process.env.LOG_RETENTION_HOURS ?? '') || 24,
		logMaxTotalMb: parseFloat(process.env.LOG_MAX_TOTAL_MB ?? '') || 200,
	};
}
