import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { FollowedPortfolio, PortfolioRiskEntry } from '../types.js';
import type { Logger } from './logger.js';

/**
 * Persists per-portfolio margin-band overrides to `.copy-portfolio-risk.json`
 * — a user-editable file, not machine-only state like StateStore/
 * IgnoredTradesStore. `sync()` is what keeps it an accurate, current
 * reflection of who's actually followed: called every cycle with the
 * freshly-fetched followed-portfolios list, it adds a blank entry for any
 * newly-followed portfolio and drops entries for anyone no longer
 * followed, without ever touching a user's own minMarginPct/maxMarginPct
 * choices for portfolios that are still followed.
 */
export class PortfolioRiskStore {
	constructor(
		private path: string,
		private log: Logger,
	) {}

	load(): PortfolioRiskEntry[] {
		if (!existsSync(this.path)) return [];
		try {
			return JSON.parse(readFileSync(this.path, 'utf8'));
		} catch {
			return [];
		}
	}

	save(entries: PortfolioRiskEntry[]): void {
		try {
			writeFileSync(this.path, JSON.stringify(entries, null, 2));
		} catch (e: any) {
			this.log({ type: 'error', source: 'portfolio_risk_store_save', message: e.message });
		}
	}

	/**
	 * Only writes to disk when something actually changed (add/remove/
	 * title drift) — a user's hand-edited minMarginPct/maxMarginPct values
	 * are never rewritten just because a cycle ran. Returns the synced
	 * list, ordered to match `followed`.
	 */
	sync(followed: FollowedPortfolio[]): PortfolioRiskEntry[] {
		const byId = new Map(this.load().map((e) => [e.portfolioId, e]));
		const followedIds = new Set(followed.map((p) => p.id));
		let changed = false;

		for (const p of followed) {
			const existing = byId.get(p.id);
			if (!existing) {
				byId.set(p.id, {
					portfolioId: p.id,
					title: p.title,
					ownerUsername: p.ownerUsername,
					minMarginPct: null,
					maxMarginPct: null,
				});
				changed = true;
			} else if (existing.title !== p.title || existing.ownerUsername !== p.ownerUsername) {
				byId.set(p.id, { ...existing, title: p.title, ownerUsername: p.ownerUsername });
				changed = true;
			}
		}

		for (const id of [...byId.keys()]) {
			if (!followedIds.has(id)) {
				byId.delete(id);
				changed = true;
			}
		}

		const result = followed.map((p) => byId.get(p.id)!);
		if (changed) {
			this.log({
				type: 'portfolio_risk_watchlist_synced',
				portfolios: result.map((e) => ({ portfolioId: e.portfolioId, title: e.title })),
			});
			this.save(result);
		}
		return result;
	}
}
