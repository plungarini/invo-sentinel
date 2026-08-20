import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Sidebar from "@/components/layout/Sidebar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import RightRail from "@/components/layout/RightRail";
import ServiceWorkerRegister from "@/components/layout/ServiceWorkerRegister";
import SetupWizard from "@/components/settings/SetupWizard";
import { getWizardPrefill, shouldShowSetupWizard } from "@/server/daemon/settings";
import "./globals.css";

export const metadata: Metadata = {
	title: "Invo Sentinel",
	description: "Local dashboard for the Invo copy-trading daemon.",
	manifest: "/manifest.json",
	icons: {
		icon: [
			{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
			{ url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
		],
		apple: "/icons/apple-touch-icon.png",
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "Sentinel",
	},
};

export const viewport: Viewport = {
	themeColor: "#0b0b0b",
};

function RightRailSkeleton() {
	return (
		<aside className="hidden w-[320px] shrink-0 pb-8 pr-6 pt-[76px] xl:block">
			<div className="animate-pulse rounded-xl border border-border p-4">
				<div className="mb-4 h-4 w-32 rounded-md bg-surface" />
				<div className="flex flex-col gap-2.5">
					{Array.from({ length: 4 }).map((_, i) => (
						<div key={i} className="h-14 w-full rounded-xl bg-surface" />
					))}
				</div>
			</div>
		</aside>
	);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	const needsSetup = await shouldShowSetupWizard();
	const wizardPrefill = needsSetup ? await getWizardPrefill() : null;

	return (
		<html lang="en" className="dark">
			<body className="h-screen overflow-hidden bg-bg text-text font-sans antialiased">
				{needsSetup && wizardPrefill ? (
					<SetupWizard prefill={wizardPrefill} />
				) : (
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
				)}
				<MobileTabBar />
				<ServiceWorkerRegister />
			</body>
		</html>
	);
}
