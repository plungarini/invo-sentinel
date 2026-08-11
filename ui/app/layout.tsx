import type { Metadata } from "next";
import { Suspense } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import RightRail from "@/components/layout/RightRail";
import "./globals.css";

export const metadata: Metadata = {
	title: "Invo Sentinel",
	description: "Local dashboard for the Invo copy-trading daemon.",
};

function RightRailSkeleton() {
	return (
		<aside className="hidden w-[320px] shrink-0 pb-8 pr-6 pt-[76px] xl:block">
			<div className="animate-pulse rounded-2xl border border-border p-4">
				<div className="mb-4 h-4 w-32 rounded bg-surface" />
				<div className="flex flex-col gap-2.5">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="h-14 w-full rounded-xl bg-surface" />
					))}
				</div>
			</div>
		</aside>
	);
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="h-screen overflow-hidden bg-bg text-text font-sans antialiased">
				<div className="mx-auto flex h-screen max-w-[1440px] overflow-hidden">
					<Sidebar />
					<main className="flex h-screen min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 sm:px-6 md:pt-6">
						<div className="mx-auto flex h-full min-h-0 w-full max-w-[760px] flex-col">{children}</div>
					</main>
					{/* Tablet width (md-xl) drops the real rail but keeps its column so the
					layout matches invoapp's own split view instead of stretching content edge-to-edge. */}
					<aside className="hidden w-16 shrink-0 md:block xl:hidden" aria-hidden />
					<Suspense fallback={<RightRailSkeleton />}>
						<RightRail />
					</Suspense>
				</div>
				<MobileTabBar />
			</body>
		</html>
	);
}
