import { loadAnalytics } from "@/server/analytics/loadAnalytics";
import AnalyticsClient from "@/components/analytics/AnalyticsClient";
import PageHeader from "@/components/shared/PageHeader";
import { DEFAULT_ANALYTICS_PERIOD } from "@/lib/analyticsPeriod";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
	const initialData = await loadAnalytics(DEFAULT_ANALYTICS_PERIOD);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Analytics" />
			<AnalyticsClient initialData={initialData} />
		</div>
	);
}
