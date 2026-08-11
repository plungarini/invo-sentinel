import type { PortfolioRiskEntry } from "@daemon/types.js";
import { PortfolioRiskStore } from "@daemon/services/portfolio-risk-store.js";
import { PORTFOLIO_RISK_PATH } from "./paths.js";

export function readPortfolioRisk(): PortfolioRiskEntry[] {
	return new PortfolioRiskStore(PORTFOLIO_RISK_PATH, () => {}).load();
}
