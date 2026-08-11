export function formatUsd(n: number): string {
	return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatPct(n: number): string {
	const sign = n > 0 ? "+" : "";
	return `${sign}${n.toFixed(2)}%`;
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return "N/A";
	const totalMin = Math.round(ms / 60000);
	if (totalMin < 1) return "<1m";
	const days = Math.floor(totalMin / 1440);
	const hours = Math.floor((totalMin % 1440) / 60);
	const minutes = totalMin % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

export function timeAgo(isoOrMs: string | number): string {
	const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
	if (!Number.isFinite(ms)) return "unknown";

	const diffSec = Math.round((Date.now() - ms) / 1000);
	if (diffSec < 5) return "just now";
	if (diffSec < 60) return `${diffSec}s ago`;
	const diffMin = Math.round(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	return `${Math.round(diffHr / 24)}d ago`;
}
