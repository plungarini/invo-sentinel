# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Deterministic, mechanical copy-trading daemon: mirrors every open/adjust/close from every Invo portfolio you follow onto your own Hyperliquid account, clamping your margin per trade into a `[minMarginPct, maxMarginPct]` band of your own equity and capping leverage. **Trades are never skipped, only resized** — except one deliberate exception, a stale/already-profitable entry (see [Skipping stale, already-profitable entries](#skipping-stale-already-profitable-entries) below). No AI/LLM in the decision loop — see the header comment in [src/cli/auto-copy.ts](src/cli/auto-copy.ts).

Forked from `AKCodez/invo-copy-trader` (kept: the reverse-engineered Invo/Hyperliquid API surface and HL signing quirks; replaced: the AI decision loop with the mechanical logic here).

## Commands

```bash
npm run preflight        # env/HL/Invo/balance sanity checks — run this first
npm run dry-run           # full pipeline, no real orders (logs dry_run_*)
npm start                 # the real daemon
./scripts/run.sh          # same, with auto-restart on crash (state/logs persist across restarts)
npm run adopt -- <baseId> <coin> <long|short> <leverage> <marginUsd>   # manual conflict resolution
npm run close -- <coin>   # emergency manual close (stopping the daemon does NOT close positions)
npm run typecheck         # tsc --noEmit
```

There is no test suite and no lint script configured. `npm run start`/`dry-run` accept positional risk overrides: `npm start -- 2 5` (min%, max%), which take precedence over `.env`.

Runtime is `tsx` directly against TS sources (ESM, `"type": "module"`, all local imports use `.js` extensions per NodeNext-style resolution even though files are `.ts`).

## Credentials (`.env`, see `.env.example`)

`INVO_REFRESH_TOKEN`, `HL_AGENT_KEY`, `WALLET_ADDRESS` — see [README.md](README.md#credentials) for exactly how to extract each from the Invo web app's DevTools. Required; `loadConfig()` in [src/config/env.ts](src/config/env.ts) throws if any are missing.

## Architecture

Data flows in one direction, one reconcile cycle at a time (`Reconciler.run()`, called every `POLL_INTERVAL_MS`):

1. **[src/clients/invo-client.ts](src/clients/invo-client.ts)** (`InvoClient`) — reverse-engineered Invo REST wrapper. Long-lived refresh token traded for ~10min access tokens, auto-refreshed on expiry/401. **Source of truth is `get_investments(isOpen: true)` per portfolio, never the social feed** (feed has propagation delay + a server-side pagination bug beyond page 8; not implemented here at all). `recordClose`'s `baseShortId` history, in order tried: a client-generated 10-char id → `404 NOT_FOUND` (right format, server never learned that value). Adding `baseShortId` to `recordOpen`'s payload to teach it that value → `400 unrecognized_keys` (schema hard-rejects it outright; the field literally cannot be sent there). `recordOpen`'s own server-assigned UUID (`positionRecordId`/`eventId`/`tradeId`, always equal) → `400 "Too big: expected string to have <=10 characters"` — this response is the most useful evidence yet: it confirms the field genuinely wants a ≤10-char string, ruling out a UUID definitively. Current attempt (`PositionSync.openOrAdjust`): the **trader's own** `investment.baseShortId` — same 10-char format, and it's what `/dex/trade` mimic-tracking is independently keyed by — plausible but **not yet confirmed** against a live close. If it still 404s/400s, there's no remaining well-evidenced candidate left to try without a real HAR capture of the actual app's `/dex/position/close` call.
2. **[src/core/portfolio-poller.ts](src/core/portfolio-poller.ts)** (`PortfolioPoller`) — turns the two polling endpoints into typed data; logs only on followed-set changes to avoid spam.
3. **[src/core/reconciler.ts](src/core/reconciler.ts)** (`Reconciler`) — orchestrates one full cycle: fetches ALL portfolios' open investments up front (not portfolio-by-portfolio) before acting on any of them — this whole-picture-first ordering is what lets `PositionSync` distinguish an unambiguous same-coin conflict from a genuinely ambiguous one. Then for each investment calls `PositionSync.openOrAdjust`; afterward, anything tracked for that portfolio no longer in its open list gets `PositionSync.close`'d. If a whole portfolio is unfollowed (not just one investment closing), anything tracked from it is un-tracked (state entry deleted) but **never closed** — unfollowing is a decision to stop automated management, not an instruction to flatten a real position, possibly at a loss; the real position is left exactly as-is for manual handling, and becomes visible via `logUntrackedPositions()`. `logUntrackedPositions()` separately cross-checks real HL wallet positions against tracked state and flags anything neither tracked nor explained. `run()` also logs `cycle_start`/`cycle_checkpoint`(per-portfolio)/`cycle_complete` with timing, specifically so a future hang is immediately localizable from logs alone without needing to attach a live debugger.
4. **[src/core/position-sync.ts](src/core/position-sync.ts)** (`PositionSync`) — the actual decision engine, keyed by the trader's `baseId`. Computes target margin (trader's margin % of _their_ balance, clamped via `risk-policy` into your equity band), diffs against tracked state, places the delta order. Also owns same-coin conflict detection/auto-adopt (see below) and full unclamped closes.
5. **[src/core/mimic-resolver.ts](src/core/mimic-resolver.ts)** — when multiple followed traders hold the same coin/direction and a pre-existing real position needs attributing, queries Invo's own `/dex/trade` mimic-tracking (`isMimicked`/`unmimickedCount`) as ground truth rather than guessing.
6. **[src/services/risk-policy.ts](src/services/risk-policy.ts)** — pure functions, no I/O: `clampMarginFraction`, `clampLeverage`. The entire risk philosophy lives here: never reject, only resize.
7. **[src/clients/hyperliquid-client.ts](src/clients/hyperliquid-client.ts)** (`HyperliquidClient`) — thin wrapper over the `hyperliquid` SDK + public `/info` REST. Has two load-bearing signing quirks tied to the phantom-agent-key setup — **do not touch without testing against a live order**: `reduce_only` must always be `false` (breaks signature recovery otherwise; reduces/closes are just opposite-direction orders that HL nets automatically), and `grouping` must always be `'na'` (also breaks signature recovery; this is also why there's no exchange-side TP/SL).
8. **[src/services/state-store.ts](src/services/state-store.ts)** — synchronous JSON persistence of `PositionStateMap` to `.copy-state.json`, keyed by trader `baseId`. Saved after every order attempt, not batched.
9. **[src/services/logger.ts](src/services/logger.ts)** — JSON-line logger to `logs/<name>-YYYY-MM-DD.log` + stdout, self-enforcing retention (`LOG_RETENTION_HOURS`) and total-size cap (`LOG_MAX_TOTAL_MB`, oldest evicted first).
10. **[src/services/healthcheck.ts](src/services/healthcheck.ts)** — optional `HEALTHCHECK_PING_URL` pings (`/start` + success/`fail`, e.g. healthchecks.io) around each reconcile cycle. Fire-and-forget by design, never awaited from the main loop — a slow/unreachable monitor must never delay trading. The one exception is `pingFailAwaited`, used only from the fatal crash handlers with a short bounded timeout, since a true fire-and-forget ping there would very likely get killed by `process.exit()` before it left the machine.
11. **[src/services/stale-entry-policy.ts](src/services/stale-entry-policy.ts)** — pure functions, no I/O: `evaluateStaleEntry`, `computeInvestmentPnlPercent`. The one deliberate exception to risk-policy's "never reject, only resize": a trade already too old to mirror faithfully by the time it's about to be opened fresh gets skipped instead — permanently, on age alone, regardless of its PnL at that moment.
12. **[src/services/ignored-trades-store.ts](src/services/ignored-trades-store.ts)** — synchronous JSON persistence of `IgnoredTradesMap` to `.copy-ignored.json`, separate from `.copy-state.json` on purpose: these baseIds were never opened, so they must stay out of the close-detection loop in `Reconciler.run()`, which issues real Hyperliquid closes for anything tracked but no longer in a trader's open list.

### Skipping stale, already-profitable entries

Right before `PositionSync.openOrAdjust` would place a genuinely brand-new order (no real position to adopt, nothing tracked yet for this `baseId`), it calls `evaluateStaleEntry(investment, staleEntry)` — a two-tier gate, age first, PnL second:

- Age alone, past `STALE_ENTRY_MAX_AGE_MINUTES`, is a **permanent** disqualifier regardless of current PnL — `verdict.permanent === true`. The `baseId` is written to `IgnoredTradesMap` and never retried, never reconsidered, for the life of that investment. This is the important gate: the age check does not require the trade to *also* be profitable right now — an old, currently-flat, or even losing entry is still too stale to mirror faithfully.
- Still within the age window but already up more than `STALE_ENTRY_MAX_PROFIT_PCT`% is a **temporary** skip (`verdict.permanent === false`) — logged as `fresh_entry_profit_skip`, nothing written to `IgnoredTradesMap`, re-evaluated fresh next cycle (it can still cool off before the window expires, or the window can simply expire and the permanent rule takes over).

This exists specifically for the case where a same-coin conflict (below) clears: trader A's tracked investment closes, freeing the coin, and trader B's investment — which had been sitting there flagged as a conflict the whole time, however old — would otherwise get opened immediately at 0% PnL and full size, no matter what its PnL happens to be at that exact instant. That's not mirroring B's trade; it's a new bet wearing B's sizing, so age alone has to be enough to block it. The same check also guards the plain case of an investment that's simply already old by the time this daemon first sees it (e.g. on startup backfill).

`Reconciler.run()` clears an ignored entry the moment that `baseId` disappears from the trader's own open-investments list (mirroring the tracked-state close-detection loop) — a future trade from the same trader gets a fresh `baseId` regardless, so there's nothing left to guard against.

### Hyperliquid's $10 minimum order notional

HL rejects any order under $10 notional outright, independent of this project's own risk band. Checked before touching the exchange at all: a brand-new open whose computed notional (clamped margin × leverage) lands under that floor is bumped up to `HL_MIN_NOTIONAL_USD * 1.02` (position-sync.ts) — the buffer matters because rounding the order size down to the coin's `szDecimals` can otherwise undershoot back below $10 and get rejected right back (observed live). An incremental top-up (or small reduce) on an already-tracked position landing under $10 is left completely untouched instead — it genuinely cannot be placed at any size correction, so retrying it would just fail identically every cycle; it's revisited next cycle once `targetMarginUsd` has drifted further from `entry.marginUsd`. Tracked `marginUsd` is always computed from the actual (rounded, possibly floor-bumped) filled size, not the pre-rounding target, so state matches what really executed.

Any order HL still rejects for another reason is logged as `order_rejected` and leaves state/Invo completely untouched (see `orderFillError` in `hyperliquid-client.ts`) — HL returns 200 OK even for a rejected order, with the real outcome nested in the response body, so this is checked explicitly rather than relying on a thrown exception.

### Same-coin, multiple-traders conflict resolution

Hyperliquid nets positions **by coin**, not by trader, so a pre-existing real position has to be attributed to exactly one tracked `baseId` before delta-sizing can work (per-baseId math assumes a tracked baseId owns the _entire_ real position on that coin — this breaks if two ever share one coin). Resolution order in `PositionSync.openOrAdjust`, cheapest checks first:

1. Wrong direction vs. your real position → ruled out, no API call.
2. Right direction, no other followed trader shares this coin+direction → unambiguous, auto-adopted instantly.
3. Right direction, shared with another follower → ask `mimic-resolver.ts` (Invo's own record of what you actually clicked "Mimic" on).
4. Still inconclusive (no update history yet, or rarely >1 candidate confirms) → logged as `existing_position_conflict`, left untouched until `npm run adopt` or manual close.

**Known limitation**: only one trader's investment can be tracked per coin at a time, even after resolution. A second followed trader later opening a position in an already-tracked coin (from a different trader) is flagged as a conflict rather than aggregated. True multi-trader aggregation on one coin would need state keyed by `(coin, direction)` instead of `baseId` — not implemented.

### CLI entry points ([src/cli/](src/cli))

- `auto-copy.ts` — the daemon; installs `uncaughtException`/`unhandledRejection` handlers that log-and-exit(1) rather than trying to limp on, relying on `scripts/run.sh`/pm2/systemd to restart.
- `preflight.ts` — read-only checks (env, Invo auth + refresh-token expiry, HL connect, market data, balance/positions), JSON output, exits non-zero on any failure.
- `adopt.ts` — manual fixup for conflicts the reconciler can't safely resolve; writes local state only, places no orders, doesn't touch Invo's `/dex/position/create`.
- `close-position.ts` — emergency manual flatten for one coin; also clears any tracked `baseId` mapped to that coin.
- `reconcile.ts` — read-only audit, no orders/state changes. Cross-checks recent daemon behavior against two sources the live reconciler never consults: Invo's `isOpen: false` closed-investment history, and Hyperliquid's own `userFills` (matched to our logs by `oid`). Flags `unexplained_untracked_open`, `missed_close`, `delayed_close`, `unverified_fill`, `position_closed_externally`, and (info-severity) `open_never_filled` — the last two share the same raw signature (tracked it, later found nothing real to close) and are told apart by checking whether the original `opened` event's own `hlResult` shows a real fill. See README's "Auditing what actually happened" section.

Types in [src/types.ts](src/types.ts) mirror Invo's own reverse-engineered API field names 1:1 (no renaming), so payloads can be diff'd directly against real responses while debugging. Note `entrySize` is the trader's margin as a **percent of their own balance**, not yours — confirmed against the Invo app UI, undocumented elsewhere.

## Comments

Comments should be rare, reserved for genuinely special occasions — a hidden constraint, a non-obvious workaround, a subtle invariant that would surprise a reader (e.g. the HL signing quirks noted above). Default to no comment.

- Never write a comment that's really a note directed at the user/reviewer (explaining what you just changed, why you chose one approach over another, a fix's backstory). That belongs in conversation, not the file.
- No multi-line explanatory blocks. If a comment can't be said in one short line, it's saying too much for a comment.
- If you encounter an existing wall of comments while touching a file, don't leave it as-is: remove it if it's not load-bearing, or failing that shrink it to the one non-obvious fact worth keeping. Only leave a large block untouched if you're genuinely unsure it isn't documenting something real underneath the noise — ask first in that case.

## Branching (gitflow, local-only)

This repo follows gitflow. There is no remote push/PR workflow expected here — branches are **local only**.

- **Work happens on `develop`**, not `master`. `master` is release-only.
- When a task calls for isolating work (a discrete feature or a bug fix), create a local `feature/*` or `bugfix/*` branch off `develop`. **Never create, merge, or touch `hotfix/*` or `release/*` branches at all** — those are the user's exclusively, both to create and to merge/close.
- **You may merge and delete `feature/*` and `bugfix/*` branches yourself** once the work is done and merged back into `develop` — no need to ask first for these two types.
- Don't create a branch for every trivial change; use judgment the same way gitflow intends it — reach for a branch when the change is a distinct feature/fix worth isolating, not for a one-line tweak.
- **Keep branch names short and concise** (e.g. `bugfix/leverage-cap`, `feature/close-endpoint`) — not full sentences (e.g. not `bugfix/never-close-unfollowed-just-untrack`). A few hyphenated words is enough; the commit messages carry the detail.
- **Merge commit messages state what kind of merge it is, not what changed.** Use git's own default merge message — `Merge branch '<branch-name>' into <target>` (e.g. `Merge branch 'feature/emergency-page' into develop`, `Merge branch 'hotfix/0.9.4' into develop`) — never a Conventional-Commits-style summary of the diff. The branch name already says what it is; the merge commit's job is to record the topology (which branch merged into which), not re-describe the contents.

## Commits

**READ THIS CAREFULLY. The rules below are strict and non-negotiable.**

### 1. Never commit automatically — commits happen only via the `/anthropic-skills:git-commit` skill, invoked by the user

- **Do not run `git commit` on your own initiative, ever** — not after finishing a task, not because everything builds/typechecks, not because the user said "wrap this up" or asked you to make changes. Making changes is never implicit permission to commit them.
- The user commits by explicitly invoking the `git-commit` skill themselves. Wait for that. If asked to stage or prepare a commit message, you may do so, but do not run `git commit`.
- If unsure whether the user actually invoked the skill vs. just discussing commit content, assume they did NOT, and ask.

### 2. Commit messages are ONE SHORT LINE — never multi-line

- Single line/phrase, one `-m`. No body, no bullet points, no wrapped explanation.
- Conventional Commits format: `fix(sync): clamp margin before comparing to dust threshold`, `feat(cli): add adopt override for baseShortId`, `chore: bump deps`.
- Detail belongs in conversation, never in the commit body.

### 3. Commit via a plain shell command — NEVER attribute it to Claude/AI

- Plain `git commit -m "..."`. No `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" footer, no AI attribution of any kind, in any commit made in this repo.

### 4. Always re-check the real working tree before drafting messages, and leave nothing behind

- Run `git status` / `git diff` first; don't rely on memory of what was touched, since the user may have edited files too.
- Before staging, check for anything that looks like it should be gitignored (stray build output, local env files, editor artifacts) rather than blindly `git add`-ing everything.
- A full commit pass means nothing modified/untracked is left behind afterward (aside from intentionally gitignored files) — verify with a final `git status`.

### 5. Commits MUST be GRANULAR — never lump unrelated changes together

- Group by concern and commit each group separately: one commit, one coherent change describable without "and". Split implementation vs. config vs. unrelated fixes into separate commits even if they landed in the same session.
- When in doubt, more/smaller commits over one lumped commit.
