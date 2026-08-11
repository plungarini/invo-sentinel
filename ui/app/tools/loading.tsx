import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import PageHeader from "@/components/shared/PageHeader";

export default function ToolsLoading() {
	return (
		<div>
			<PageHeader title="Tools" />
			<div className="flex flex-col gap-2.5 pt-14 md:pt-0">
				{Array.from({ length: 1 }).map((_, i) => (
					<Card key={i} className="flex items-center gap-3.5">
						<Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
						<div className="min-w-0 flex-1">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="mt-2 h-3 w-48" />
						</div>
					</Card>
				))}
			</div>
		</div>
	);
}
