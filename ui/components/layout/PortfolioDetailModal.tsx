"use client";

import Modal from "@/components/shared/Modal";
import PortfolioStatsBody from "@/components/layout/PortfolioStatsBody";
import type { FollowedPortfolioSummary } from "@/server/daemon/loadFollowedPortfolios";

export default function PortfolioDetailModal({
	portfolio,
	onClose,
}: {
	portfolio: FollowedPortfolioSummary;
	onClose: () => void;
}) {
	return (
		<Modal onClose={onClose} title="Portfolio">
			<PortfolioStatsBody portfolio={portfolio} />
		</Modal>
	);
}
