import type { FollowedPortfolio } from "@daemon/types.js";
import { FollowedPortfoliosStore } from "@daemon/services/followed-portfolios-store.js";
import { FOLLOWED_PORTFOLIOS_PATH } from "./paths.js";

export function readFollowedPortfolios(): FollowedPortfolio[] {
	return new FollowedPortfoliosStore(FOLLOWED_PORTFOLIOS_PATH, () => {}).load();
}
