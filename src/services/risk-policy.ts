import type { PortfolioRiskEntry, RiskConfig } from '../types.js';

/**
 * Pure risk math; no I/O, no state, fully unit-testable in isolation.
 * The whole philosophy: never reject a trade, only resize it.
 */

/**
 * Converts the trader's margin % (already a percent, e.g. 0.2 == 0.20%,
 * confirmed against the Invo app UI) into a fraction clamped into
 * [minMarginPct, maxMarginPct] of YOUR equity.
 */
export function clampMarginFraction(traderEntrySizePercent: number, risk: RiskConfig): number {
	const traderFraction = traderEntrySizePercent / 100;
	return Math.min(Math.max(traderFraction, risk.minMarginPct), risk.maxMarginPct);
}

/** Caps leverage at risk.maxLeverage. No cap configured → passthrough. */
export function clampLeverage(traderLeverage: number, risk: RiskConfig): number {
	if (risk.maxLeverage == null || !Number.isFinite(risk.maxLeverage)) return traderLeverage;
	return Math.min(traderLeverage, risk.maxLeverage);
}

export interface ResolvedPortfolioRisk {
	risk: RiskConfig;
	overridden: boolean;
	/** Set when a custom band existed but was invalid; `risk` above is the global fallback in that case. */
	invalidOverrideReason?: string;
}

/**
 * Per-portfolio override of the margin band only — leverage cap stays
 * global-only, not something a portfolio override touches. `null` on
 * either field falls back to the global value for that field. A resulting
 * band that fails the same validation `loadConfig` applies to the global
 * one (min >= 0, max >= min) is rejected entirely — falls back to the full
 * global band rather than clamping into something arbitrary — so a typo
 * in the override file can't silently misconfigure risk.
 */
export function resolvePortfolioRisk(
	globalRisk: RiskConfig,
	override: Pick<PortfolioRiskEntry, 'minMarginPct' | 'maxMarginPct'> | undefined,
): ResolvedPortfolioRisk {
	if (!override || (override.minMarginPct == null && override.maxMarginPct == null)) {
		return { risk: globalRisk, overridden: false };
	}

	const minMarginPct = override.minMarginPct != null ? override.minMarginPct / 100 : globalRisk.minMarginPct;
	const maxMarginPct = override.maxMarginPct != null ? override.maxMarginPct / 100 : globalRisk.maxMarginPct;

	if (minMarginPct < 0 || maxMarginPct < minMarginPct) {
		return {
			risk: globalRisk,
			overridden: false,
			invalidOverrideReason: `custom margin band min=${(minMarginPct * 100).toFixed(2)}% max=${(maxMarginPct * 100).toFixed(2)}% is invalid (min must be >= 0 and <= max); falling back to .env defaults`,
		};
	}

	return { risk: { ...globalRisk, minMarginPct, maxMarginPct }, overridden: true };
}
