"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/shared/Card";
import Badge from "@/components/shared/Badge";
import RowSkeleton from "@/components/wallet/RowSkeleton";
import PortfolioStatsBody from "@/components/layout/PortfolioStatsBody";
import { usePortfolioAnalysis } from "@/hooks/usePortfolioAnalysis";

export default function PortfolioAnalysisPanel({ initialPortfolioId }: { initialPortfolioId: string }) {
	const router = useRouter();
	const [input, setInput] = useState(initialPortfolioId);
	const { data, error, isLoading } = usePortfolioAnalysis(initialPortfolioId || null);

	const lookUp = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = input.trim();
		if (trimmed) router.push(`/tools/portfolio-analysis?portfolioId=${encodeURIComponent(trimmed)}`);
	};

	return (
		<div className="flex flex-col gap-4 p-1">
			<form onSubmit={lookUp} className="flex gap-2">
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Portfolio ID"
					className="min-w-0 flex-1 rounded-xl bg-surface px-4 py-2.5 text-[14px] outline-none placeholder:text-text-muted focus:ring-2 focus:ring-accent"
				/>
				<button
					type="submit"
					className="cursor-pointer rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 active:scale-95"
				>
					Analyze
				</button>
			</form>

			{!initialPortfolioId ? (
				<Card>
					<p className="px-1 py-4 text-center text-[14px] text-text-muted">
						Enter a portfolio ID above, or open one from the Followed Portfolios rail, to see its stats.
					</p>
				</Card>
			) : isLoading ? (
				<RowSkeleton count={2} />
			) : error || !data || !data.found || !data.portfolio ? (
				<Card>
					<p className="px-1 py-4 text-center text-[14px] text-text-muted">
						No data found for portfolio <span className="font-mono">{initialPortfolioId}</span>.
					</p>
				</Card>
			) : (
				<Card>
					<PortfolioStatsBody
						portfolio={data.portfolio}
						statusBadge={
							data.isFollowing ? (
								<Badge tone="accent">Following</Badge>
							) : (
								<Badge tone="neutral">Not following</Badge>
							)
						}
					/>
				</Card>
			)}
		</div>
	);
}
