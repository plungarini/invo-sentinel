/** Short human-readable detail string for one raw daemon log event, for the lifecycle timeline. */
export function humanizeLogEvent(e: Record<string, unknown>): string | undefined {
	const type = e.type as string;
	switch (type) {
		case "opened":
			return `opened ${e.side ?? ""} at ${e.leverage ?? "?"}x`.trim();
		case "auto_adopted":
			return `adopted pre-existing position, margin ${fmtUsd(e.adoptedMarginUsd)}`;
		case "increased":
			return `increased margin to ${fmtUsd(e.marginUsdAfter)}`;
		case "reduced":
			return `reduced margin to ${fmtUsd(e.marginUsdAfter)}`;
		case "resynced_to_live_position":
			return `resynced to live position, margin ${fmtUsd(e.realMarginUsd)}`;
		case "closed":
			return "trader closed, mirrored on Hyperliquid";
		case "manual_close":
			return "manually closed via CLI (npm run close)";
		case "manual_close_detected":
			return "no real HL position found; assumed manual/external close";
		case "manual_direction_change_detected":
			return `real position direction changed to ${e.realDirection ?? "?"} manually`;
		case "stale_entry_ignored":
			return `permanently skipped, ${e.ageMinutes ?? "?"}min old`;
		case "fresh_entry_profit_skip":
			return `temporarily skipped, already up ${e.pnlPct ?? "?"}%`;
		case "existing_position_conflict":
			return "flagged as a same-coin conflict with another followed trader";
		case "conflict_resolved":
			return `conflict resolved: ${e.reason ?? ""}`.trim();
		case "order_rejected":
			return `order rejected by Hyperliquid: ${e.message ?? ""}`.trim();
		case "skip_close":
			return "no open HL position found to close";
		default:
			return undefined;
	}
}

function fmtUsd(n: unknown): string {
	return typeof n === "number" ? `$${n.toFixed(2)}` : "?";
}
