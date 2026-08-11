import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import PageHeader from "@/components/shared/PageHeader";

export default function OverviewLoading() {
	return (
		<div>
			<PageHeader title="Overview" />
			<div className="flex flex-col gap-4 pt-14 md:pt-0">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Card key={i}>
							<div className="flex items-start gap-3">
								<Skeleton className="h-10 w-10 rounded-xl" />
								<div className="flex-1">
									<Skeleton className="h-3 w-20" />
									<Skeleton className="mt-2 h-6 w-28" />
								</div>
							</div>
							<Skeleton className="mt-3 h-3 w-36" />
						</Card>
					))}
				</div>
				<Card title="Recent Activity">
					<div className="flex flex-col gap-2.5">
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className="h-16 w-full rounded-xl" />
						))}
					</div>
				</Card>
			</div>
		</div>
	);
}
