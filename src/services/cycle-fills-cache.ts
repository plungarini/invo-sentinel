import type { HyperliquidClient } from '../clients/hyperliquid-client.js';
import type { HyperliquidFill } from '../types.js';

/** Memoizes one `getUserFills()` call for the duration of a single reconcile cycle, shared between PositionSync's conflict resolution and cloid-attribution's discovery step - both may need fills in the same cycle, but never more than one real HL call between them. `reset()` at the start of each cycle. */
export class CycleFillsCache {
	private promise: Promise<HyperliquidFill[]> | null = null;

	constructor(private hl: HyperliquidClient) {}

	reset(): void {
		this.promise = null;
	}

	getOnce(): Promise<HyperliquidFill[]> {
		if (!this.promise) this.promise = this.hl.getUserFills();
		return this.promise;
	}
}
