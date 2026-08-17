import type { ClosedTradeRecord } from "@daemon/types.js";
import { ClosedTradesStore } from "@daemon/services/closed-trades-store.js";
import { DB_PATH } from "./paths.js";

export function readClosedTrades(): ClosedTradeRecord[] {
	return new ClosedTradesStore(DB_PATH, () => {}).list();
}
