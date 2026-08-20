import "server-only";
import { loadConfig } from "@daemon/config/env.js";
import { APP_VERSION } from "@daemon/version.js";
import { getConfigStore } from "./paths";

export interface RequiredSecretsFormValues {
	/** Masked preview (e.g. "eyJ0…9f3a"), never the real value - see `maskSecret`. */
	invoRefreshToken: string;
	/** Masked preview, never the real value. */
	hlAgentKey: string;
	/** The real value - a public HL address, not a secret. */
	walletAddress: string;
}

export interface TuningFormValues {
	minMarginPct: string;
	maxMarginPct: string;
	maxLeverage: string;
	staleEntryMaxAgeMinutes: string;
	staleEntryMaxProfitPct: string;
	staleEntryMaxAgeEnabled: boolean;
	staleEntryMaxProfitEnabled: boolean;
	pollIntervalMs: string;
	logRetentionHours: string;
	logMaxTotalMb: string;
	healthcheckPingUrl: string;
}

export interface TraderModeFormValues {
	enabled: boolean;
	portfolioId: string;
	autoShare: boolean;
	caption: string;
}

export interface EmergencyFormValues {
	noNewPositions: boolean;
	fullStop: boolean;
}

export interface UpdateFormValues {
	autoUpdate: boolean;
	/** Baked into this running process at build time - never stale relative to what's actually deployed, unlike a DB-stored value would be. */
	currentVersion: string;
	/** Last result the daemon's own update-checker saw, persisted so this page never makes its own GitHub call - see auto-copy.ts's comment on why. Null until the daemon has checked at least once. */
	lastCheckedAt: string | null;
	latestVersionSeen: string | null;
}

/** Gate for the first-run setup wizard - DB rows only, never `.env`, so an existing Pi/Docker `.env`-only deployment never sees an unnecessary wizard. */
export async function shouldShowSetupWizard(): Promise<boolean> {
	return !getConfigStore().hasRequiredSecretsInDb();
}

/**
 * A trade-authority-bearing secret (HL agent key) or long-lived auth token
 * must never round-trip to the browser in the clear on an unauthenticated
 * LAN dashboard - this is a display-only hint, not the value itself, and
 * neither the wizard nor the settings form ever prefills a real secret into
 * an input.
 */
export function maskSecret(value: string): string {
	if (!value) return "";
	if (value.length <= 12) return "•".repeat(value.length);
	return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export interface WizardPrefill {
	/** Not a secret - safe to prefill in full so the field starts pre-populated and editable. */
	walletAddress: string;
	/** Masked preview, shown as a placeholder only - never the real value. Empty string means nothing is resolvable yet (no DB row, no `.env` value either). */
	maskedInvoRefreshToken: string;
	maskedHlAgentKey: string;
}

/**
 * What the wizard prefills from - `loadConfig()`'s already-resolved DB-first/
 * `.env`-fallback value for each of the 3 required fields, so a Pi/Docker
 * user with a working `.env` can just click through and "Save and start"
 * without retyping anything they've already got. The two secret fields never
 * leave the server as real values, only as masked previews (same discipline
 * as `getSettingsFormValues`); the actual value used on save (if the field is
 * left blank) is resolved server-side in `saveWizardSecrets`, never sent to
 * the browser at all.
 */
export async function getWizardPrefill(): Promise<WizardPrefill> {
	const config = await loadConfig(getConfigStore());
	return {
		walletAddress: config.walletAddress,
		maskedInvoRefreshToken: maskSecret(config.invoRefreshToken),
		maskedHlAgentKey: maskSecret(config.hlAgentKey),
	};
}

/** Prefills the Settings form with today's *effective* values (DB, falling back to `.env`) - not just raw DB rows, so a Pi/Docker user editing settings for the first time sees their real running config instead of a blank form. */
export async function getSettingsFormValues(): Promise<{
	secrets: RequiredSecretsFormValues;
	tuning: TuningFormValues;
	traderMode: TraderModeFormValues;
	emergency: EmergencyFormValues;
	update: UpdateFormValues;
}> {
	const config = await loadConfig(getConfigStore());
	const stored = getConfigStore().load();
	return {
		secrets: {
			invoRefreshToken: maskSecret(config.invoRefreshToken),
			hlAgentKey: maskSecret(config.hlAgentKey),
			// Not a secret - a public HL address - shown in full so the user can confirm it's the right one.
			walletAddress: config.walletAddress,
		},
		tuning: {
			minMarginPct: String(Math.round(config.risk.minMarginPct * 100 * 100) / 100),
			maxMarginPct: String(Math.round(config.risk.maxMarginPct * 100 * 100) / 100),
			maxLeverage: config.risk.maxLeverage != null ? String(config.risk.maxLeverage) : "",
			staleEntryMaxAgeMinutes: String(config.staleEntry.maxAgeMinutes),
			staleEntryMaxProfitPct: String(config.staleEntry.maxProfitPct),
			staleEntryMaxAgeEnabled: config.staleEntry.maxAgeEnabled,
			staleEntryMaxProfitEnabled: config.staleEntry.maxProfitEnabled,
			pollIntervalMs: String(config.pollIntervalMs),
			logRetentionHours: String(config.logRetentionHours),
			logMaxTotalMb: String(config.logMaxTotalMb),
			healthcheckPingUrl: config.healthcheckPingUrl ?? "",
		},
		traderMode: {
			enabled: config.traderMode.enabled,
			portfolioId: config.traderMode.portfolioId ?? "",
			autoShare: config.traderMode.autoShare,
			caption: config.traderMode.caption ?? "",
		},
		emergency: {
			noNewPositions: config.emergency.noNewPositions,
			fullStop: config.emergency.fullStop,
		},
		update: {
			autoUpdate: config.update.autoUpdate,
			currentVersion: APP_VERSION,
			lastCheckedAt: stored.updateLastCheckedAt ?? null,
			latestVersionSeen: stored.updateLatestVersionSeen ?? null,
		},
	};
}
