/**
 * Fraction of the entry-to-liquidation price range already used up, based on
 * the live mark price - not how far mark has drifted from entry, which would
 * wrongly count a favorable move (further from liq than entry) as "progress"
 * via an absolute-value diff. Clamped to [0, 100]; null when any input is
 * missing or entry/liq coincide (zero range).
 */
export function computeLiqFilledPct(entryPx: number, markPx: number | null, liqPx: number | null): number | null {
	if (markPx == null || liqPx == null || !Number.isFinite(entryPx)) return null;
	const liqRange = Math.abs(entryPx - liqPx);
	if (liqRange === 0) return null;
	const liqDistance = Math.abs(markPx - liqPx);
	return Math.max(0, Math.min(100, (1 - liqDistance / liqRange) * 100));
}
