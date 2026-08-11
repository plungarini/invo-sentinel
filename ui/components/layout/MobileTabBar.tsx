"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isNavLinkActive } from "./navLinks";

export default function MobileTabBar() {
	const pathname = usePathname();

	return (
		<nav className="fixed inset-x-6 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-30 flex items-center justify-between rounded-full border border-border bg-card/90 px-2 py-2 shadow-lg backdrop-blur-xl md:hidden">
			{NAV_LINKS.map((link) => {
				const active = isNavLinkActive(pathname, link.href);
				const Icon = link.icon;
				return (
					<Link
						key={link.href}
						href={link.href}
						className={`flex flex-1 items-center justify-center rounded-full py-2.5 transition-colors duration-150 ${
							active ? "bg-surface-hover text-text" : "text-text-faint"
						}`}
					>
						<Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
					</Link>
				);
			})}
		</nav>
	);
}
