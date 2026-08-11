import Card from "@/components/shared/Card";
import StatTile from "@/components/shared/StatTile";
import { KeyIcon } from "@/components/icons/Icons";

export default function TokenExpiryWidget({ tokenDaysRemaining }: { tokenDaysRemaining: number | null }) {
	if (tokenDaysRemaining === null) {
		return (
			<Card>
				<StatTile label="Refresh Token" value="Unknown" icon={KeyIcon} tone="neutral" />
			</Card>
		);
	}

	const urgent = tokenDaysRemaining < 3;
	const warning = tokenDaysRemaining < 10;
	const valueClassName = urgent ? "text-loss" : warning ? "text-badge-amber" : "text-text";
	const tone = urgent ? "loss" : warning ? "amber" : "accent";

	return (
		<Card>
			<StatTile
				label="Refresh Token"
				value={`${Math.round(tokenDaysRemaining)}d`}
				valueClassName={valueClassName}
				icon={KeyIcon}
				tone={tone}
			/>
		</Card>
	);
}
