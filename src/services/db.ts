import type { Database } from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { openDatabase } from './sqlite-adapter.js';

/**
 * One connection per db file, shared across every *-store.ts in this
 * process (auto-copy.ts, adopt.ts, close-position.ts, reconcile.ts, and the
 * UI's read-only server routes all resolve to the same `data/sentinel.db`)
 * - better-sqlite3 handles concurrent access across processes itself (WAL
 * mode below), this cache just avoids reopening the same file repeatedly
 * within one process.
 */
const connections = new Map<string, Database>();

export function openDb(path: string): Database {
	const cached = connections.get(path);
	if (cached) return cached;

	mkdirSync(dirname(path), { recursive: true });
	const isNew = !existsSync(path);
	const db = openDatabase(path);
	// WAL so the UI's read-only connection is never blocked by the daemon's
	// writes (or vice versa) - both open the same file concurrently.
	db.pragma('journal_mode = WAL');
	runMigrations(db);
	if (isNew) importLegacyJson(db, dirname(path));
	connections.set(path, db);
	return db;
}

function runMigrations(db: Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS position_state (
			base_id TEXT PRIMARY KEY,
			coin TEXT NOT NULL,
			is_buy INTEGER NOT NULL,
			leverage REAL NOT NULL,
			margin_usd REAL NOT NULL,
			our_base_short_id TEXT NOT NULL,
			portfolio_id TEXT,
			owner_username TEXT,
			entry_price REAL,
			opened_at TEXT,
			last_applied_fraction REAL
		);

		CREATE TABLE IF NOT EXISTS ignored_trades (
			base_id TEXT PRIMARY KEY,
			coin TEXT NOT NULL,
			portfolio_id TEXT,
			reason TEXT NOT NULL,
			ignored_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS cloid_attribution_cache (
			coin TEXT PRIMARY KEY,
			kind TEXT NOT NULL,
			checked_at TEXT NOT NULL,
			position_size TEXT NOT NULL,
			base_short_id TEXT,
			investment_base_id TEXT,
			portfolio_id TEXT,
			trader TEXT
		);

		CREATE TABLE IF NOT EXISTS followed_portfolios (
			id TEXT PRIMARY KEY,
			data TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS app_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS closed_trades (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			base_id TEXT NOT NULL,
			coin TEXT NOT NULL,
			is_buy INTEGER NOT NULL,
			leverage REAL,
			margin_usd REAL,
			portfolio_id TEXT,
			portfolio_title TEXT,
			owner_username TEXT,
			entry_price REAL,
			closing_price REAL,
			opened_at TEXT,
			closed_at TEXT NOT NULL,
			close_reason TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_closed_trades_base_id ON closed_trades(base_id);
		CREATE INDEX IF NOT EXISTS idx_closed_trades_portfolio ON closed_trades(portfolio_id);
		CREATE INDEX IF NOT EXISTS idx_closed_trades_coin ON closed_trades(coin);
		CREATE INDEX IF NOT EXISTS idx_closed_trades_closed_at ON closed_trades(closed_at);
	`);
}

/**
 * One-time import from the flat JSON files this replaces, run only the
 * moment `sentinel.db` is first created - never again, so it can't clobber
 * anything the DB itself has since written. Deliberately does not delete
 * the JSON files afterward; they're harmless leftovers once the daemon
 * only reads/writes the DB; leaving them for manual review/backup is
 * simpler and safer than an automated delete.
 */
function importLegacyJson(db: Database, dataDir: string): void {
	const readJson = <T>(name: string, fallback: T): T => {
		const p = join(dataDir, name);
		if (!existsSync(p)) return fallback;
		try {
			return JSON.parse(readFileSync(p, 'utf8'));
		} catch {
			return fallback;
		}
	};

	const state = readJson<Record<string, any>>('.copy-state.json', {});
	const insertState = db.prepare(
		`INSERT OR REPLACE INTO position_state (base_id, coin, is_buy, leverage, margin_usd, our_base_short_id, portfolio_id, owner_username, entry_price, opened_at, last_applied_fraction)
		 VALUES (@baseId, @coin, @isBuy, @leverage, @marginUsd, @ourBaseShortId, @portfolioId, @ownerUsername, @entryPrice, @openedAt, @lastAppliedFraction)`,
	);
	for (const [baseId, e] of Object.entries(state)) {
		insertState.run({
			baseId,
			coin: e.coin,
			isBuy: e.isBuy ? 1 : 0,
			leverage: e.leverage,
			marginUsd: e.marginUsd,
			ourBaseShortId: e.ourBaseShortId,
			portfolioId: e.portfolioId ?? null,
			ownerUsername: e.ownerUsername ?? null,
			entryPrice: e.entryPrice ?? null,
			openedAt: e.openedAt ?? null,
			lastAppliedFraction: e.lastAppliedFraction ?? null,
		});
	}

	const ignored = readJson<Record<string, any>>('.copy-ignored.json', {});
	const insertIgnored = db.prepare(
		`INSERT OR REPLACE INTO ignored_trades (base_id, coin, portfolio_id, reason, ignored_at)
		 VALUES (@baseId, @coin, @portfolioId, @reason, @ignoredAt)`,
	);
	for (const [baseId, e] of Object.entries(ignored)) {
		insertIgnored.run({ baseId, coin: e.coin, portfolioId: e.portfolioId ?? null, reason: e.reason, ignoredAt: e.ignoredAt });
	}

	const cloidCache = readJson<Record<string, any>>('.copy-cloid-cache.json', {});
	const insertCloid = db.prepare(
		`INSERT OR REPLACE INTO cloid_attribution_cache (coin, kind, checked_at, position_size, base_short_id, investment_base_id, portfolio_id, trader)
		 VALUES (@coin, @kind, @checkedAt, @positionSize, @baseShortId, @investmentBaseId, @portfolioId, @trader)`,
	);
	for (const [coin, e] of Object.entries(cloidCache)) {
		insertCloid.run({
			coin,
			kind: e.kind,
			checkedAt: e.checkedAt,
			positionSize: e.positionSize,
			baseShortId: e.baseShortId ?? null,
			investmentBaseId: e.investmentBaseId ?? null,
			portfolioId: e.portfolioId ?? null,
			trader: e.trader ?? null,
		});
	}

	const followed = readJson<any[]>('.copy-followed-portfolios.json', []);
	const insertFollowed = db.prepare(`INSERT OR REPLACE INTO followed_portfolios (id, data) VALUES (?, ?)`);
	for (const p of followed) insertFollowed.run(p.id, JSON.stringify(p));
}
