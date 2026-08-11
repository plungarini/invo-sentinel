import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import type { CycleStatus } from "@/server/daemon/computeStatus";
import { HeartRateIcon } from "@/components/icons/Icons";

const STALE_THRESHOLD_MS = 60_000; // 2x a guessed 30s poll interval; real POLL_INTERVAL_MS isn't in this payload

export default function DaemonHealthWidget({ cycle }: { cycle: CycleStatus }) {
	let label = "Unknown";
	let colorClassName = "text-text-muted";
	let tone: "neutral" | "profit" | "amber" = "neutral";

	if (!cycle.lastEventTs) {
		label = "Unknown";
		colorClassName = "text-text-muted";
		tone = "neutral";
	} else if (Date.now() - Date.parse(cycle.lastEventTs) < STALE_THRESHOLD_MS) {
		label = "Healthy";
		colorClassName = "text-profit";
		tone = "profit";
	} else {
		label = "Stale";
		colorClassName = "text-badge-amber";
		tone = "amber";
	}

	return (
		<Card>
			<StatTile label="Daemon Health" value={label} valueClassName={colorClassName} icon={HeartRateIcon} tone={tone} />
		</Card>
	);
}
