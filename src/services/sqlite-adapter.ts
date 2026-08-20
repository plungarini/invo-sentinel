import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import { createRequire } from 'module';

// This file is ESM ("type": "module") - `require` isn't a global here, and
// both drivers below have to be loaded conditionally at runtime (never a
// static top-level import), so a scoped require is created once and reused.
const require = createRequire(import.meta.url);

/**
 * Selects the SQLite driver at runtime: `better-sqlite3` under normal
 * Node/tsx dev (and any non-Bun host), `bun:sqlite` when this process is the
 * Bun-compiled daemon - `better-sqlite3`'s native N-API addon panics the
 * instant it's touched under Bun (`NAPI FATAL ERROR: Error::New
 * napi_get_last_error_info`, confirmed live on Windows/Bun 1.3.14, upstream
 * oven-sh/bun#4290/#24956, still open), and `bun:sqlite` only exists inside
 * the Bun runtime, so neither driver can be a static top-level import here.
 *
 * `bun:sqlite`'s Statement API differs from better-sqlite3's in two ways
 * every *-store.ts in this codebase actually relies on, both patched below
 * so store code needs zero changes: no `.pragma()` method (PRAGMA is issued
 * via `.exec()` instead), and named-parameter binds require the bound
 * object's own keys to carry the `@` prefix (`{'@baseId': ...}`), whereas
 * better-sqlite3 matches bare keys (`{baseId: ...}`) against `@baseId` in
 * the SQL - every store here uses the bare-key form, verified by grep.
 */
export function openDatabase(path: string): BetterSqliteDatabase {
	if (isBunRuntime()) return openBunSqlite(path);
	return openBetterSqlite(path);
}

function isBunRuntime(): boolean {
	return typeof (globalThis as any).Bun !== 'undefined';
}

function openBetterSqlite(path: string): BetterSqliteDatabase {
	const DatabaseConstructor = require('better-sqlite3');
	return new DatabaseConstructor(path);
}

function openBunSqlite(path: string): BetterSqliteDatabase {
	const { Database: BunDatabase } = require('bun:sqlite');
	const raw = new BunDatabase(path);
	return wrapBunDatabase(raw) as unknown as BetterSqliteDatabase;
}

function prefixBareKeys(params: unknown): unknown {
	if (
		params == null ||
		typeof params !== 'object' ||
		Array.isArray(params) ||
		// Already-prefixed (@/$/:) callers, or a Buffer/typed value, pass through untouched.
		Object.keys(params as object).some((k) => /^[@$:]/.test(k))
	) {
		return params;
	}
	return Object.fromEntries(Object.entries(params as Record<string, unknown>).map(([k, v]) => [`@${k}`, v]));
}

// Every store here calls .run()/.get()/.all() either with N positional
// values (`?` placeholders, e.g. close-position.ts's `.get(baseId)`) or with
// exactly one named-param object (`@key` placeholders) - never both, so args
// is only ever length 0/1/N. Only the single-object case needs key-prefixing;
// spreading positional args straight through is what the earlier
// single-`params`-arg version of this wrapper silently dropped past index 0.
function bindArgs(args: unknown[]): unknown[] {
	if (args.length === 1 && args[0] != null && typeof args[0] === 'object' && !Array.isArray(args[0])) {
		return [prefixBareKeys(args[0])];
	}
	return args;
}

function wrapBunStatement(stmt: any) {
	return {
		run: (...args: unknown[]) => stmt.run(...bindArgs(args)),
		get: (...args: unknown[]) => stmt.get(...bindArgs(args)),
		all: (...args: unknown[]) => stmt.all(...bindArgs(args)),
	};
}

function wrapBunDatabase(raw: any) {
	return {
		prepare: (sql: string) => wrapBunStatement(raw.prepare(sql)),
		exec: (sql: string) => raw.exec(sql),
		transaction: (fn: (...args: any[]) => void) => raw.transaction(fn),
		// better-sqlite3's db.pragma('journal_mode = WAL') equivalent - bun:sqlite has no .pragma().
		pragma: (statement: string) => raw.exec(`PRAGMA ${statement}`),
	};
}
