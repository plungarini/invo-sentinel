import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import { ClockDotsIcon } from "@/components/icons/Icons";
import { formatShortDuration } from "@/lib/format";

export default function AvgPollTimeWidget({
	avgPollDurationMs,
	avgPollSampleCount,
	pollIntervalMs,
}: {
	avgPollDurationMs: number | null;
	avgPollSampleCount: number;
	pollIntervalMs: number;
}) {
	if (avgPollDurationMs == null) {
		return (
			<Card>
				<StatTile label="Avg Poll Time" value="No data yet" icon={ClockDotsIcon} tone="neutral" />
			</Card>
		);
	}

	const tone = avgPollDurationMs < pollIntervalMs ? "profit" : avgPollDurationMs > pollIntervalMs ? "amber" : "neutral";
	const colorClassName = tone === "profit" ? "text-profit" : tone === "amber" ? "text-badge-amber" : "";

	return (
		<Card>
			<StatTile
				label="Avg Poll Time"
				value={formatShortDuration(avgPollDurationMs)}
				valueClassName={colorClassName}
				icon={ClockDotsIcon}
				tone={tone}
				title={`Averaged over the last ${avgPollSampleCount} cycle${avgPollSampleCount === 1 ? "" : "s"} vs. a ${formatShortDuration(pollIntervalMs)} poll interval`}
			/>
		</Card>
	);
}
