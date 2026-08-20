import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves the project root a CLI entry point should anchor `data/`/`logs/`
 * to - dev (`tsx`) and a `bun build --compile` standalone executable need
 * different anchors, and using the wrong one for the latter is silent and
 * fatal (confirmed empirically 2026-08-19, compiling `auto-copy.ts` and
 * running the real .exe): inside a compiled binary, `import.meta.url` (and
 * `import.meta.dir`/`Bun.main`) resolve into Bun's internal virtual bundle
 * filesystem - rendered as `B:\~BUN\root\<exe>` on Windows, documented as
 * `/$bunfs/root/<exe>` on other platforms - not the real on-disk location
 * of the running .exe. `existsSync()` on that path returns `true` (Bun's own
 * `fs` shim fakes it), so a naive "does this path exist" check can't tell
 * the two cases apart either - confirmed by testing that specific approach
 * before landing on the one below. `dirname` on the virtual path then joins
 * into a nonexistent drive/path, and `sentinel.db`'s directory can never be
 * created (`EPERM`) - the compiled daemon fails at the very first DB open,
 * before any config or logging exists to explain why.
 *
 * The one reliable signal that distinguishes "this process IS the compiled
 * executable" from every other invocation mode (dev `tsx`, `bun run`, plain
 * `node`) is `process.argv[0] === 'bun'` - a literal string, not a real
 * path, unique to how Bun launches a self-contained compiled binary
 * (confirmed empirically; `bun run` and node/tsx both put a real absolute
 * interpreter path in argv[0]). This isn't a documented Bun API/contract,
 * just an observed behavior as of Bun 1.3.14 - if a future Bun version
 * changes it, this needs re-verifying against a real compiled binary, not
 * just typechecked. In that compiled case, `process.execPath` IS the real,
 * absolute path to the running .exe (confirmed correct regardless of the
 * caller's cwd) - anchor `data/`/`logs/` there directly, i.e. inside `bin/`
 * alongside the binary itself, not at the release root next to
 * `start.bat`/`start.sh`. This is a deliberate choice, not an oversight: an
 * earlier version of this anchored one level up (release root), which kept
 * `data/`/`logs/` out of `bin/` but left them sitting next to the
 * user-facing `start.bat`/`GETTING-STARTED.txt`/`README.md` - reported as
 * cluttered. `bin/` is already "internal implementation, don't touch" by
 * convention (that's why the binary itself lives there instead of at the
 * top level - see CLAUDE.md's packaging section); its own generated state
 * belongs with it, not spilled out next to the files a user actually reads.
 */
export function resolveRootDir(importMetaUrl: string): string {
	if (process.argv[0] === 'bun') {
		return dirname(process.execPath);
	}
	return join(dirname(fileURLToPath(importMetaUrl)), '..', '..');
}
