import type { RiskConfig } from '../types.js';

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
