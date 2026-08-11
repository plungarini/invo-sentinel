import Skeleton from "@/components/shared/Skeleton";

/** Mimics the shape of a filled-card row (position/trade/transfer) while its tab's data loads. */
export default function RowSkeleton({ count = 5 }: { count?: number }) {
	return (
		<div className="flex flex-col gap-2.5">
			{Array.from({ length: count }).map((_, i) => (
				<div key={i} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3.5">
					<div className="flex min-w-0 flex-col gap-2">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-3 w-32" />
					</div>
					<div className="flex shrink-0 flex-col items-end gap-2">
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-4 w-16" />
					</div>
				</div>
			))}
		</div>
	);
}
