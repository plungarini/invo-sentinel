import type { InvoClient } from '../clients/invo-client.js';
import type { OpenInvestment } from '../types.js';

const EPOCH = '1970-01-01T00:00:00.000Z';

export interface MimicResolution {
	/** The trader baseId Invo's own mimic-tracking confirms you're mimicking, or null if inconclusive. */
	resolvedBaseId: string | null;
	reason: string;
}

/**
 * When several followed traders hold the same coin in the same direction,
 * there's no need to guess which one a pre-existing real position belongs
 * to; Invo's own mimic engine already tracks this. /dex/trade, queried
 * with a trade's baseShortId, returns its update history annotated with
 * `isMimicked` per update and an `unmimickedCount` summary; a trade you
 * actually mimicked through the app comes back with unmimickedCount: 0
 * and isMimicked: true throughout, while one you never touched comes back
 * unmimickedCount > 0 / isMimicked: false. That's ground truth, not an
 * inference; this only fails to resolve when a trade has no update
 * history yet to carry the signal, or (rarely) more than one candidate
 * confirms at once.
 */
export async function resolveMimickedCandidate(
	invo: InvoClient,
	candidates: OpenInvestment[],
): Promise<MimicResolution> {
	if (candidates.length === 0) return { resolvedBaseId: null, reason: 'no candidates to check' };

	let statusList: any[];
	try {
		const resp = await invo.getTradeStatus(
			candidates.map((c) => ({ baseShortId: c.baseShortId, mimicStartedAt: EPOCH })),
		);
		statusList = resp.data ?? [];
	} catch (e: any) {
		return { resolvedBaseId: null, reason: `dex/trade lookup failed: ${e.message}` };
	}

	const confirmed = statusList.filter(
		(s) => Array.isArray(s.updates) && s.updates.length > 0 && s.unmimickedCount === 0,
	);

	if (confirmed.length === 1) {
		return {
			resolvedBaseId: confirmed[0].investmentBaseId,
			reason: 'confirmed via Invo mimic-tracking (unmimickedCount: 0 across its update history)',
		};
	}
	if (confirmed.length === 0) {
		return { resolvedBaseId: null, reason: 'no candidate confirmed as mimicked (likely no update history yet)' };
	}
	return {
		resolvedBaseId: null,
		reason: `${confirmed.length} candidates all confirmed as mimicked; genuinely ambiguous`,
	};
}
