import { HomeIcon, ActivityIcon, WalletIcon, WrenchToolIcon } from "@/components/icons/Icons";

export const NAV_LINKS = [
	{ href: "/", label: "Overview", icon: HomeIcon },
	{ href: "/analytics", label: "Analytics", icon: ActivityIcon },
	{ href: "/wallet", label: "Wallet", icon: WalletIcon },
	{ href: "/tools", label: "Tools", icon: WrenchToolIcon },
];

/** Prefix-aware match so nested routes (e.g. a trade detail deep link under /wallet) still highlight their parent section. */
export function isNavLinkActive(pathname: string, href: string): boolean {
	if (href === "/") return pathname === "/";
	return pathname === href || pathname.startsWith(`${href}/`);
}
