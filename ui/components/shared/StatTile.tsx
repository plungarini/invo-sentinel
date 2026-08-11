import type { IconProps } from "@/components/icons/Icons";

type IconComponent = React.ComponentType<IconProps>;

const ICON_TONES = {
	neutral: "bg-surface-hover text-text-muted",
	accent: "bg-accent/15 text-accent",
	profit: "bg-profit/15 text-profit",
	loss: "bg-loss/15 text-loss",
	amber: "bg-badge-amber/15 text-badge-amber",
} as const;

export default function StatTile({
	label,
	value,
	valueClassName = "",
	icon: Icon,
	tone = "neutral",
	title,
}: {
	label: string;
	value: string | number;
	valueClassName?: string;
	icon?: IconComponent;
	tone?: keyof typeof ICON_TONES;
	title?: string;
}) {
	return (
		<div className="flex items-center gap-3">
			{Icon && (
				<div className={`flex shrink-0 items-center justify-center rounded-xl p-2 ${ICON_TONES[tone]}`}>
					<Icon className="h-[18px] w-[18px]" strokeWidth={2} />
				</div>
			)}
			<div className="flex min-w-0 flex-col gap-0.5">
				<span className="text-[13px] font-medium text-text-muted">{label}</span>
				<span
					className={`truncate text-[19px] font-bold leading-tight tracking-[-0.01em] ${valueClassName}`}
					title={title}
				>
					{value}
				</span>
			</div>
		</div>
	);
}
