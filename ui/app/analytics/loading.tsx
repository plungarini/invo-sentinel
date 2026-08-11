import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import PageHeader from "@/components/shared/PageHeader";

export default function AnalyticsLoading() {
	return (
		<div>
			<PageHeader title="Analytics" />
			<div className="flex flex-col gap-4 pt-14 md:pt-0">
				<Card>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						{Array.from({ length: 3 }).map((_, i) => (
							<div key={i} className="flex items-start gap-3">
								<Skeleton className="h-10 w-10 rounded-xl" />
								<div className="flex-1">
									<Skeleton className="h-3 w-16" />
									<Skeleton className="mt-2 h-6 w-24" />
								</div>
							</div>
						))}
					</div>
				</Card>
				<Card>
					<Skeleton className="h-64 w-full rounded-xl" />
				</Card>
				<Card>
					<div className="flex flex-col gap-2.5">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-[104px] w-full rounded-xl" />
						))}
					</div>
				</Card>
			</div>
		</div>
	);
}
