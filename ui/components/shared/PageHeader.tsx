/** iOS-style nav title. On mobile it's a fixed, translucent bar (content scrolls beneath it); on desktop it's a plain static title above the content. */
export default function PageHeader({ title, live }: { title: string; live?: boolean }) {
	return (
		<div className="fixed inset-x-0 top-0 z-20 flex h-11 items-center justify-center gap-2 bg-bg/70 px-4 backdrop-blur-xl md:static md:mb-5 md:h-8 md:bg-transparent md:px-0 md:backdrop-blur-none">
			<span className="text-[15px] font-semibold tracking-tight">{title}</span>
			{live && (
				<span className="relative flex h-1.5 w-1.5" title="Live, refreshing automatically">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-75" />
					<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
				</span>
			)}
		</div>
	);
}
