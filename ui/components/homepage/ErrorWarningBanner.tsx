import { AlertTriangle } from "lucide-react";
import { timeAgo } from "@/lib/format";
import type { RecentError } from "@/server/daemon/computeStatus";

export default function ErrorWarningBanner({ recentErrors }: { recentErrors: RecentError[] }) {
	if (recentErrors.length === 0) return null;

	return (
		<div className="rounded-2xl bg-loss/10 p-4">
			<div className="mb-3 flex items-center gap-2 px-1">
				<AlertTriangle className="h-4 w-4 text-loss" strokeWidth={2.25} />
				<h3 className="text-[15px] font-bold text-loss">Recent Errors</h3>
			</div>
			<ul className="flex flex-col gap-2">
				{recentErrors.map((err, i) => (
					<li key={i} className="rounded-xl bg-loss/10 px-4 py-3 text-[14px]">
						<span className="font-semibold">{err.type}</span>
						{err.source ? <span className="text-text-muted"> from {err.source}</span> : null}
						{err.message ? <span className="text-text-muted">: {err.message}</span> : null}
						<span className="text-text-muted"> ({timeAgo(err.ts)})</span>
					</li>
				))}
			</ul>
		</div>
	);
}
