import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import { ReceiptEditIcon } from "@/components/icons/Icons";

export default function TrackedPositionsWidget({ trackedCount }: { trackedCount: number }) {
	return (
		<Card>
			<StatTile label="Tracked Positions" value={trackedCount} icon={ReceiptEditIcon} tone="accent" />
		</Card>
	);
}
