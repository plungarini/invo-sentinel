"use server";

import { revalidatePath } from "next/cache";
import { getAppConfig, getConfigStore, invalidateConfigCache } from "@/server/daemon/paths";
import { invalidateInvoClient } from "@/server/invo/client";
import { invalidateHyperliquidClient } from "@/server/hyperliquid/client";
import { verifyCredentials, verifyTraderModePortfolio } from "@/server/daemon/verifyCredentials";

export interface ActionState {
	ok: boolean;
	error?: string;
}

const SECRET_FIELDS = ["invoRefreshToken", "hlAgentKey", "walletAddress"] as const;

/**
 * The form never carries a real secret value back from the browser except
 * one the user actually typed just now (see `RequiredSecretsForm` - masked
 * hints are display-only, never a `defaultValue`), so a blank field here
 * unambiguously means "leave this one alone", not "clear it" - required-ness
 * on first run is enforced client-side (`required` on the wizard's inputs)
 * plus the at-least-one check below, not per-field here.
 */
export async function saveRequiredSecrets(_prev: ActionState, formData: FormData): Promise<ActionState> {
	const current = await getAppConfig();
	const entries: Record<string, string> = {};
	const resolved: Record<string, string> = {};
	for (const field of SECRET_FIELDS) {
		const typed = String(formData.get(field) ?? "").trim();
		if (typed) entries[field] = typed;
		resolved[field] = typed || current[field];
	}
	if (Object.keys(entries).length === 0) return { ok: false, error: "Enter at least one value." };

	// Verify the full resolved triple, not just what changed - an HL connect
	// check needs both hlAgentKey and walletAddress together even if only
	// one of the two was actually edited this time.
	const verification = await verifyCredentials({
		invoRefreshToken: resolved.invoRefreshToken,
		hlAgentKey: resolved.hlAgentKey,
		walletAddress: resolved.walletAddress,
	});
	if (!verification.ok) return { ok: false, error: verification.error };

	getConfigStore().setMany(entries);
	invalidateConfigCache();
	invalidateInvoClient();
	invalidateHyperliquidClient();
	revalidatePath("/", "layout");
	return { ok: true };
}

/**
 * First-run save, distinct from `saveRequiredSecrets` above because "blank"
 * means something different here: the wizard's whole point is that a field
 * already resolvable from `.env` gets confirmed *into the DB*, not silently
 * left as an `.env`-only fallback (which would never satisfy
 * `hasRequiredSecretsInDb()`, so the wizard would just keep reappearing). A
 * blank field is resolved server-side from `loadConfig()`'s current
 * DB-first/`.env`-fallback value - which never touches the browser, so the
 * masked previews shown to the user stay display-only throughout.
 */
export async function saveWizardSecrets(_prev: ActionState, formData: FormData): Promise<ActionState> {
	const configStore = getConfigStore();
	const current = await getAppConfig();

	const entries: Record<string, string> = {};
	const missing: string[] = [];
	for (const field of SECRET_FIELDS) {
		const typed = String(formData.get(field) ?? "").trim();
		const resolved = typed || current[field];
		if (!resolved) missing.push(field);
		else entries[field] = resolved;
	}
	if (missing.length > 0) return { ok: false, error: `${missing.join(", ")} ${missing.length > 1 ? "are" : "is"} required.` };

	const verification = await verifyCredentials({
		invoRefreshToken: entries.invoRefreshToken,
		hlAgentKey: entries.hlAgentKey,
		walletAddress: entries.walletAddress,
	});
	if (!verification.ok) return { ok: false, error: verification.error };

	configStore.setMany(entries);
	invalidateConfigCache();
	invalidateInvoClient();
	invalidateHyperliquidClient();
	revalidatePath("/", "layout");
	return { ok: true };
}

function requireNumber(formData: FormData, field: string, opts: { min?: number } = {}): number {
	const raw = String(formData.get(field) ?? "").trim();
	const n = parseFloat(raw);
	if (!Number.isFinite(n)) throw new Error(`${field} must be a number.`);
	if (opts.min !== undefined && n < opts.min) throw new Error(`${field} must be >= ${opts.min}.`);
	return n;
}

export async function saveTuningSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
	try {
		const minMarginPct = requireNumber(formData, "minMarginPct");
		const maxMarginPct = requireNumber(formData, "maxMarginPct");
		if (minMarginPct < 0) return { ok: false, error: "Min margin % can't be negative." };
		if (maxMarginPct < minMarginPct) return { ok: false, error: "Max margin % can't be less than min margin %." };

		const maxLeverageRaw = String(formData.get("maxLeverage") ?? "").trim();
		if (maxLeverageRaw) {
			const maxLeverage = parseFloat(maxLeverageRaw);
			if (!Number.isFinite(maxLeverage) || maxLeverage <= 0) {
				return { ok: false, error: "Max leverage must be greater than 0, or blank for no cap." };
			}
		}

		const staleEntryMaxAgeMinutes = requireNumber(formData, "staleEntryMaxAgeMinutes", { min: 0 });
		const staleEntryMaxProfitPct = requireNumber(formData, "staleEntryMaxProfitPct", { min: 0 });
		const staleEntryMaxAgeEnabled = formData.get("staleEntryMaxAgeEnabled") === "on";
		const staleEntryMaxProfitEnabled = formData.get("staleEntryMaxProfitEnabled") === "on";
		const pollIntervalMs = requireNumber(formData, "pollIntervalMs");
		const logRetentionHours = requireNumber(formData, "logRetentionHours", { min: 0 });
		const logMaxTotalMb = requireNumber(formData, "logMaxTotalMb", { min: 0 });
		const healthcheckPingUrl = String(formData.get("healthcheckPingUrl") ?? "").trim();

		const configStore = getConfigStore();
		configStore.setMany({
			minMarginPct: String(minMarginPct),
			maxMarginPct: String(maxMarginPct),
			staleEntryMaxAgeMinutes: String(staleEntryMaxAgeMinutes),
			staleEntryMaxProfitPct: String(staleEntryMaxProfitPct),
			staleEntryMaxAgeEnabled: String(staleEntryMaxAgeEnabled),
			staleEntryMaxProfitEnabled: String(staleEntryMaxProfitEnabled),
			pollIntervalMs: String(pollIntervalMs),
			logRetentionHours: String(logRetentionHours),
			logMaxTotalMb: String(logMaxTotalMb),
			// Written as an explicit empty row, not deleted - row *presence* is what
			// makes a DB value authoritative over `.env` (see `readValue`), so a
			// deleted row would silently fall back to a stale `.env` value instead
			// of actually clearing the field.
			maxLeverage: maxLeverageRaw,
			healthcheckPingUrl,
		});

		invalidateConfigCache();
		revalidatePath("/settings");
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * A portfolio ID is only actually validated (see `verifyTraderModePortfolio`)
 * when Trader mode is being turned ON with one set - saving with the toggle
 * off, or clearing the portfolio ID, never needs a live Invo call.
 */
export async function saveTraderModeSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
	try {
		const enabled = formData.get("enabled") === "on";
		const portfolioId = String(formData.get("portfolioId") ?? "").trim();
		const autoShare = formData.get("autoShare") === "on";
		const caption = String(formData.get("caption") ?? "").trim();

		if (enabled) {
			if (!portfolioId) return { ok: false, error: "Portfolio ID is required to enable Trader mode." };
			const current = await getAppConfig();
			const verification = await verifyTraderModePortfolio(current.invoRefreshToken, portfolioId);
			if (!verification.ok) return { ok: false, error: verification.error };
		}

		getConfigStore().setMany({
			traderModeEnabled: String(enabled),
			traderModePortfolioId: portfolioId,
			traderModeAutoShare: String(autoShare),
			traderModeCaption: caption,
		});

		invalidateConfigCache();
		revalidatePath("/settings");
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function saveEmergencySettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
	try {
		const noNewPositions = formData.get("noNewPositions") === "on";
		const fullStop = formData.get("fullStop") === "on";

		getConfigStore().setMany({
			emergencyNoNewPositions: String(noNewPositions),
			emergencyFullStop: String(fullStop),
		});

		invalidateConfigCache();
		revalidatePath("/settings");
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}

export async function saveUpdateSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
	try {
		const autoUpdate = formData.get("autoUpdate") === "on";

		getConfigStore().setMany({ autoUpdate: String(autoUpdate) });

		invalidateConfigCache();
		revalidatePath("/settings");
		return { ok: true };
	} catch (e) {
		return { ok: false, error: e instanceof Error ? e.message : String(e) };
	}
}
