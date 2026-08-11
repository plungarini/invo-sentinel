import Card from "@/components/shared/Card";
import { timeAgo } from "@/lib/format";
import type { RecentActivityEntry } from "@/server/daemon/computeStatus";
import { ArrowUpRight, ArrowDownRight, Plus, ShieldAlert, Ban } from "lucide-react";

const ICON_BY_TYPE: Record<string, typeof Plus> = {
	opened: Plus,
	auto_adopted: Plus,
	increased: ArrowUpRight,
	reduced: ArrowDownRight,
	closed: Ban,
	manual_close_detected: ShieldAlert,
	manual_direction_change_detected: ShieldAlert,
	existing_position_conflict: ShieldAlert,
	stale_entry_ignored: Ban,
};

const TONE_BY_TYPE: Record<string, string> = {
	opened: "bg-profit/15 text-profit",
	auto_adopted: "bg-profit/15 text-profit",
	increased: "bg-accent/15 text-accent",
	reduced: "bg-accent/15 text-accent",
	closed: "bg-surface-hover text-text-muted",
	manual_close_detected: "bg-badge-amber/15 text-badge-amber",
	manual_direction_change_detected: "bg-badge-amber/15 text-badge-amber",
	existing_position_conflict: "bg-badge-amber/15 text-badge-amber",
	stale_entry_ignored: "bg-surface-hover text-text-muted",
};

const LABEL_BY_TYPE: Record<string, string> = {
	opened: "Opened",
	auto_adopted: "Adopted existing position",
	increased: "Increased margin",
	reduced: "Reduced margin",
	closed: "Closed",
	manual_close_detected: "Manual close detected",
	manual_direction_change_detected: "Manual direction change detected",
	existing_position_conflict: "Same-coin conflict flagged",
	stale_entry_ignored: "Stale entry skipped",
};

export default function RecentActivityWidget({ activity }: { activity: RecentActivityEntry[] }) {
	return (
		<Card title="Recent Activity">
			{activity.length === 0 ? (
				<p className="px-1 py-8 text-center text-[14px] text-text-muted">No trade activity in the last 2 hours.</p>
			) : (
				<ul className="flex flex-col gap-2.5">
					{activity.map((entry, i) => {
						const Icon = ICON_BY_TYPE[entry.type] ?? Plus;
						const tone = TONE_BY_TYPE[entry.type] ?? "bg-surface-hover text-text-muted";
						return (
							<li key={i} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3">
								<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
									<Icon className="h-4 w-4" strokeWidth={2.25} />
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-[15px] font-semibold">{LABEL_BY_TYPE[entry.type] ?? entry.type}</p>
									<p className="truncate text-[13px] text-text-muted">
										{entry.coin ?? ""}
										{entry.coin && entry.trader ? " · " : ""}
										{entry.trader ? `via ${entry.trader}` : ""}
									</p>
								</div>
								<span className="shrink-0 text-[13px] text-text-muted">{timeAgo(entry.ts)}</span>
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}
