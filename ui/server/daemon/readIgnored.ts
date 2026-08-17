import type { IgnoredTradesMap } from "@daemon/types.js";
import { IgnoredTradesStore } from "@daemon/services/ignored-trades-store.js";
import { DB_PATH } from "./paths.js";

export function readIgnoredTrades(): IgnoredTradesMap {
	return new IgnoredTradesStore(DB_PATH, () => {}).load();
}
