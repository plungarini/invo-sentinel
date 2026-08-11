import Card from "@/components/shared/Card";
import Skeleton from "@/components/shared/Skeleton";
import PageHeader from "@/components/shared/PageHeader";

export default function WalletLoading() {
	return (
		<div>
			<PageHeader title="Wallet" />
			<div className="flex flex-col gap-5 pt-14 md:pt-0">
				<Card>
					<Skeleton className="h-4 w-28" />
					<Skeleton className="mt-2 h-11 w-52" />
				</Card>
				<div className="flex gap-2">
					<Skeleton className="h-9 w-20 rounded-full" />
					<Skeleton className="h-9 w-24 rounded-full" />
					<Skeleton className="h-9 w-24 rounded-full" />
				</div>
				<div className="flex flex-col gap-2.5">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-[74px] w-full rounded-xl" />
					))}
				</div>
			</div>
		</div>
	);
}
