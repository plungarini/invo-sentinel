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

console.log('smoke-test-db: openDb() opens, migrates, and round-trips correctly on this runtime.');
