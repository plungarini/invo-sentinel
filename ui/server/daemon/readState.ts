import type { PositionStateMap } from "@daemon/types.js";
import { StateStore } from "@daemon/services/state-store.js";
import { DB_PATH } from "./paths.js";

export function readTrackedState(): PositionStateMap {
	return new StateStore(DB_PATH, () => {}).load();
}
