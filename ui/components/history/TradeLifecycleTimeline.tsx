import { AlertTriangle, Ban, Circle, type LucideIcon } from "lucide-react";
import { InboxDownIcon, InboxUpIcon, ReceiptEditIcon, type IconProps } from "@/components/icons/Icons";
import { timeAgo } from "@/lib/format";
import type { TradeLifecycleEvent } from "@/types/ui";

type IconComponent = React.ComponentType<IconProps> | LucideIcon;

const ICONS_BY_TYPE: Record<string, IconComponent> = {
	opened: InboxDownIcon,
	auto_adopted: InboxDownIcon,
	opened_on_exchange: InboxDownIcon,
	dry_run_open: InboxDownIcon,
	closed: InboxUpIcon,
	closed_on_exchange: InboxUpIcon,
	increased: ReceiptEditIcon,
	reduced: ReceiptEditIcon,
	resynced_to_live_position: ReceiptEditIcon,
	dry_run_increase: ReceiptEditIcon,
	dry_run_reduce: ReceiptEditIcon,
	manual_close_detected: AlertTriangle,
	manual_direction_change_detected: AlertTriangle,
	order_rejected: Ban,
};

const TONE_BY_TYPE: Record<string, string> = {
	opened: "bg-profit/15 text-profit",
	auto_adopted: "bg-profit/15 text-profit",
	opened_on_exchange: "bg-profit/15 text-profit",
	dry_run_open: "bg-profit/15 text-profit",
	closed: "bg-surface-hover text-text-muted",
	closed_on_exchange: "bg-surface-hover text-text-muted",
	increased: "bg-accent/15 text-accent",
	reduced: "bg-accent/15 text-accent",
	resynced_to_live_position: "bg-accent/15 text-accent",
	dry_run_increase: "bg-accent/15 text-accent",
	dry_run_reduce: "bg-accent/15 text-accent",
	manual_close_detected: "bg-badge-amber/15 text-badge-amber",
	manual_direction_change_detected: "bg-badge-amber/15 text-badge-amber",
	order_rejected: "bg-loss/15 text-loss",
};

function formatEventType(type: string): string {
	const label = type.replace(/_/g, " ");
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function TradeLifecycleTimeline({ lifecycle }: { lifecycle: TradeLifecycleEvent[] }) {
	if (lifecycle.length === 0) {
		return <p className="text-sm text-text-muted">No lifecycle log data available (outside log retention window).</p>;
	}

	const ordered = [...lifecycle].reverse();

	return (
		<ol className="flex flex-col gap-4 border-l border-border pl-6">
			{ordered.map((event, i) => {
				const Icon = ICONS_BY_TYPE[event.type] ?? Circle;
				const tone = TONE_BY_TYPE[event.type] ?? "bg-surface-hover text-text-muted";
				return (
					<li key={i} className="relative">
						<span className={`absolute -left-9 flex h-6 w-6 items-center justify-center rounded-full ${tone}`}>
							<Icon className="h-3.5 w-3.5" strokeWidth={2} />
						</span>
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium">{formatEventType(event.type)}</span>
							<span className="text-xs text-text-muted">{timeAgo(event.ts)}</span>
						</div>
						{event.detail ? <p className="text-sm text-text-muted">{event.detail}</p> : null}
					</li>
				);
			})}
		</ol>
	);
}
