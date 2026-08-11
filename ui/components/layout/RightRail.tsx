import Card from "@/components/shared/Card";
import FollowedPortfoliosList from "@/components/layout/FollowedPortfoliosList";
import { loadFollowedPortfolios } from "@/server/daemon/loadFollowedPortfolios";

export default async function RightRail() {
	let portfolios: Awaited<ReturnType<typeof loadFollowedPortfolios>> = [];
	try {
		portfolios = await loadFollowedPortfolios();
	} catch {
		return null; // credentials not configured yet - don't block the page on this
	}

	return (
		<aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 overflow-y-auto pb-8 pr-6 pt-[76px] xl:block">
			<Card title="Followed Portfolios" transparent>
				<FollowedPortfoliosList portfolios={portfolios} />
			</Card>

			<p className="mt-4 px-2 text-[12px] leading-relaxed text-text-muted/70">
				Personal dashboard for reverse-engineered Invo data. Not endorsed by, affiliated with, or sponsored by
				Invo.
			</p>
		</aside>
	);
}
