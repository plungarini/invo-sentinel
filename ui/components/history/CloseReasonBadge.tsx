import Badge from "@/components/shared/Badge";

const WARNING_REASONS = new Set(["manual close detected", "manual direction change detected"]);

export default function CloseReasonBadge({ reason }: { reason: string }) {
	return (
		<Badge tone={WARNING_REASONS.has(reason) ? "amber" : "neutral"} className="max-w-[240px]" title={reason}>
			{/* Badge's own span is inline-flex, so its text child needs min-w-0 to actually
			    shrink and truncate instead of overflowing the max-width unclipped. */}
			<span className="min-w-0 truncate">{reason}</span>
		</Badge>
	);
}
