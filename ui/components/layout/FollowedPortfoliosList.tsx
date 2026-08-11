"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import Badge from "@/components/shared/Badge";
import PortfolioAvatar from "@/components/layout/PortfolioAvatar";
import PortfolioDetailModal from "@/components/layout/PortfolioDetailModal";
import type { FollowedPortfolioSummary } from "@/server/daemon/loadFollowedPortfolios";

export default function FollowedPortfoliosList({ portfolios }: { portfolios: FollowedPortfolioSummary[] }) {
	const [selected, setSelected] = useState<FollowedPortfolioSummary | null>(null);

	if (portfolios.length === 0) {
		return <p className="px-1 text-[14px] text-text-muted">Not following any portfolios.</p>;
	}

	return (
		<>
			<div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto scrollbar-thin">
				{portfolios.map((p) => (
					<button
						key={p.id}
						onClick={() => setSelected(p)}
						className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover"
					>
						<PortfolioAvatar title={p.title} avatarUrl={p.ownerAvatarUrl} avatarColor={p.ownerAvatarColor} />
						<div className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-[14px] font-semibold leading-tight">{p.title.trim()}</span>
							<span className="truncate text-[13px] text-text-muted">@{p.ownerUsername ?? "unknown"}</span>
						</div>
						{p.minMarginPct != null && p.maxMarginPct != null && (
							<Badge tone="amber" className="shrink-0" title="Custom risk override">
								{p.minMarginPct}-{p.maxMarginPct}%
							</Badge>
						)}
						<ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
					</button>
				))}
			</div>

			{selected && <PortfolioDetailModal portfolio={selected} onClose={() => setSelected(null)} />}
		</>
	);
}
