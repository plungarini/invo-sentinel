"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, isNavLinkActive } from "./navLinks";

export default function Sidebar({ version }: { version: string }) {
	const pathname = usePathname();

	return (
		<aside className="sticky top-0 hidden h-screen w-[88px] shrink-0 flex-col overflow-y-auto px-3 pb-8 pt-[76px] md:flex xl:w-[272px] xl:px-5">
			<Link href="/" className="mb-9 flex items-center justify-center gap-2.5 px-0 xl:justify-start xl:px-2">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img src="/logo.png" alt="Invo" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full" />
				<span className="hidden text-[22px] font-bold tracking-tight xl:inline">Sentinel</span>
			</Link>

			<nav className="flex flex-col gap-1.5">
				{NAV_LINKS.map((link) => {
					const active = isNavLinkActive(pathname, link.href);
					const Icon = link.icon;
					return (
						<Link
							key={link.href}
							href={link.href}
							title={link.label}
							className={`flex items-center justify-center gap-3.5 rounded-xl px-0 py-3 text-[15px] transition-colors duration-150 xl:justify-start xl:px-4 ${
								active ? "nav-pill-active font-semibold" : "font-medium text-text-faint hover:bg-surface hover:text-text"
							}`}
						>
							<Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
							<span className="hidden xl:inline">{link.label}</span>
						</Link>
					);
				})}
			</nav>

			<span className="mt-auto hidden py-3 pl-4 text-[15px] font-medium text-text-faint xl:block">v{version}</span>
		</aside>
	);
}
