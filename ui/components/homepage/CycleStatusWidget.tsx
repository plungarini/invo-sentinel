import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import type { CycleStatus } from "@/server/daemon/computeStatus";
import { RestartIcon } from "@/components/icons/Icons";

export default function CycleStatusWidget({ cycle }: { cycle: CycleStatus }) {
	if (!cycle.lastEventType) {
		return (
			<Card>
				<StatTile label="Cycle Status" value="No data yet" icon={RestartIcon} tone="neutral" />
			</Card>
		);
	}

	return (
		<Card>
			<StatTile label="Cycle Status" value={cycle.lastEventType} icon={RestartIcon} tone="accent" />
		</Card>
	);
}
