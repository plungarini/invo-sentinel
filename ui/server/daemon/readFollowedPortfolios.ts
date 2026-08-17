import type { FollowedPortfolio } from "@daemon/types.js";
import { FollowedPortfoliosStore } from "@daemon/services/followed-portfolios-store.js";
import { DB_PATH } from "./paths.js";

export function readFollowedPortfolios(): FollowedPortfolio[] {
	return new FollowedPortfoliosStore(DB_PATH, () => {}).load();
}
