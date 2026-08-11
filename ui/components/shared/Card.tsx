export default function Card({
	children,
	className = "",
	title,
	action,
	transparent = false,
}: {
	children: React.ReactNode;
	className?: string;
	title?: string;
	action?: React.ReactNode;
	/** Rail-type panels (e.g. Followed Portfolios) float directly on the page bg with no boxed background, unlike ordinary content cards. */
	transparent?: boolean;
}) {
	return (
		<div className={`rounded-xl ${transparent ? "border border-border bg-transparent" : "bg-card"} p-4 sm:p-5 ${className}`}>
			{(title || action) && (
				<div className="mb-4 flex items-center justify-between px-1">
					{title && <h3 className="text-[17px] font-bold tracking-tight text-text">{title}</h3>}
					{action}
				</div>
			)}
			{children}
		</div>
	);
}
