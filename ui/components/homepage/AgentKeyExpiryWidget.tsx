"use client";

import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import { useAgentKeyStatus } from "@/hooks/useAgentKeyStatus";
import { KeyIcon } from "@/components/icons/Icons";

export default function AgentKeyExpiryWidget() {
	const { data } = useAgentKeyStatus();

	if (!data) {
		return (
			<Card>
				<StatTile label="HL Agent Key" value="N/A" icon={KeyIcon} tone="neutral" />
			</Card>
		);
	}

	if (data.daysRemaining === null) {
		return (
			<Card>
				<StatTile
					label="HL Agent Key"
					value={data.hasAgents ? "No expiry" : "Not found"}
					icon={KeyIcon}
					tone={data.hasAgents ? "accent" : "amber"}
				/>
			</Card>
		);
	}

	const urgent = data.daysRemaining < 3;
	const warning = data.daysRemaining < 10;
	const valueClassName = urgent ? "text-loss" : warning ? "text-badge-amber" : "text-text";
	const tone = urgent ? "loss" : warning ? "amber" : "accent";

	return (
		<Card>
			<StatTile
				label="HL Agent Key"
				value={`${Math.round(data.daysRemaining)}d`}
				valueClassName={valueClassName}
				icon={KeyIcon}
				tone={tone}
			/>
		</Card>
	);
}
