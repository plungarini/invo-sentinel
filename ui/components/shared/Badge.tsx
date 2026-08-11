const TONES = {
	neutral: "bg-surface-hover text-text-muted",
	profit: "bg-profit/15 text-profit",
	loss: "bg-loss/15 text-loss",
	amber: "bg-badge-amber/15 text-badge-amber",
	accent: "bg-accent/15 text-accent",
} as const;

export default function Badge({
	children,
	tone = "neutral",
	className = "",
	title,
}: {
	children: React.ReactNode;
	tone?: keyof typeof TONES;
	className?: string;
	title?: string;
}) {
	return (
		<span
			title={title}
			className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12px] font-semibold ${TONES[tone]} ${className}`}
		>
			{children}
		</span>
	);
}
