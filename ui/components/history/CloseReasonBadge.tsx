import Badge from "@/components/shared/Badge";

const WARNING_REASONS = new Set(["manual close detected", "manual direction change detected"]);

function toneFor(reason: string) {
	if (reason === "Liquidated") return "loss";
	if (WARNING_REASONS.has(reason)) return "amber";
	return "neutral";
}

export default function CloseReasonBadge({ reason }: { reason: string }) {
	return (
		<Badge tone={toneFor(reason)} className="max-w-[240px]" title={reason}>
			{/* Badge's own span is inline-flex, so its text child needs min-w-0 to actually
			    shrink and truncate instead of overflowing the max-width unclipped. */}
			<span className="min-w-0 truncate">{reason}</span>
		</Badge>
	);
}
