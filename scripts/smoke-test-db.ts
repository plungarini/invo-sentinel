// Minimal, credential-free gate for the packaging CI: confirms the actual
// runtime DB path (src/services/db.ts -> sqlite-adapter.ts) opens, migrates,
// and round-trips correctly under whatever runtime compiled this (`bun build
// --compile`), independent of any real Invo/HL credentials - unlike `npm run
// preflight`, which needs those and may never even reach a DB call.
//
// Deliberately goes through openDb(), not a direct better-sqlite3/bun:sqlite
// import - better-sqlite3's native addon is known to panic Bun's N-API host
// outright (still-open upstream oven-sh/bun#4290, confirmed live on Windows/
// Bun 1.3.14), which is exactly why sqlite-adapter.ts routes to bun:sqlite
// under Bun instead. Testing the adapter's actual selection, not the broken
// direct path it exists to avoid, is what makes this gate meaningful.
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openDb } from '../src/services/db.js';

// A fresh OS-tmpdir path, not a repo-local one - WAL mode leaves -wal/-shm
// sidecar files open for the life of the connection (openDb() caches it,
// with no close() exposed), so an in-repo dir can't be rm'd afterward on
// Windows without an EBUSY. CI workspaces are ephemeral, so skipping cleanup
// entirely here is fine; this just keeps repeat local runs tidy.
const dbDir = join(tmpdir(), `invo-sentinel-smoke-test-${process.pid}`);
const dbPath = join(dbDir, 'sentinel.db');
rmSync(dbDir, { recursive: true, force: true });

const db = openDb(dbPath);
db.prepare(`INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(
	'smoke_test',
	'1',
);
const row = db.prepare('SELECT value FROM app_config WHERE key = ?').get('smoke_test') as { value: string };
if (row.value !== '1') throw new Error(`unexpected round-trip value: ${row.value}`);

// The Trader-mode columns are added to position_state both in CREATE TABLE and
// via idempotent ALTER (db.ts) - assert they're present, and that a bare INSERT
// binding them round-trips, so a driver that silently drops the ALTER (or a
// regression in the column list) fails this gate instead of shipping.
db.prepare(
	`INSERT INTO position_state (base_id, coin, is_buy, leverage, margin_usd, our_base_short_id, trader_mode_invo_base_id, trader_mode_entry_sim, portfolio_title)
	 VALUES (@baseId, @coin, @isBuy, @leverage, @marginUsd, @ourBaseShortId, @traderModeInvoBaseId, @traderModeEntrySim, @portfolioTitle)`,
).run({
	baseId: 'smoke',
	coin: 'BTC',
	isBuy: 1,
	leverage: 3,
	marginUsd: 10,
	ourBaseShortId: 'smoke',
	traderModeInvoBaseId: 'sim-1',
	traderModeEntrySim: 0.5,
	portfolioTitle: 'Smoke Test',
});
const stateRow = db.prepare('SELECT trader_mode_invo_base_id AS id, trader_mode_entry_sim AS sim, portfolio_title AS title FROM position_state WHERE base_id = ?').get('smoke') as {
	id: string;
	sim: number;
	title: string;
};
if (stateRow.id !== 'sim-1' || stateRow.sim !== 0.5 || stateRow.title !== 'Smoke Test') {
	throw new Error(`unexpected position_state round-trip: ${JSON.stringify(stateRow)}`);
}

console.log('smoke-test-db: openDb() opens, migrates (incl. Trader-mode columns), and round-trips correctly on this runtime.');
