# Incident & investigation log

Running record of live-trading issues found, hypotheses tried, and outcomes.
Newest entries first. Every entry should say what was checked, what was found,
what was tried, and whether it worked — so nothing gets re-investigated from
scratch, and nothing gets silently left as "unresolved by design".

---

## 2026-08-09 evening — initial incident response (19:26–23:41 CEST)

**Trigger**: user reported missed opens/closes and a mimic-attribution issue after the
first stale-entry-skip deploy.

**Found and fixed** (all on `bugfix/*` branches off `develop`, merged, redeployed live):

1. HL rejects perp limit prices violating a per-coin decimal-place cap
   (`6 - szDecimals`), not just the 5-significant-figure rule the code enforced.
   Caused silent phantom "opened" trades for cheap coins (XAI, SAGA) that never
   actually filled. **Fixed**: `roundToValidLimitPx` in `hyperliquid-client.ts`
   respects both constraints.
2. HL returns 200 OK even when it rejects an order outright (error nested in
   `response.data.statuses[]`); the code never checked this, so a rejected
   order got recorded as a real open/close anyway (state + Invo mimic record).
   **Fixed**: `orderFillError()` checked on every order and close; a rejection
   leaves state/Invo untouched, retried next cycle.
3. Stale-entry rule required age **AND** profit>threshold together — an old
   trade that happened to be near-breakeven at the exact moment it was
   evaluated slipped through and opened. **Fixed**: two-tier `evaluateStaleEntry`
   — age alone is a *permanent* gate regardless of PnL; profit-while-still-fresh
   is a *temporary* per-cycle skip only.
4. Hyperliquid enforces a hard $10 minimum order notional, unrelated to this
   project's risk band. A small account + low leverage on some coins produced
   sub-$10 orders that failed every cycle until stale-entry gave up on them
   (MOODENG, PEOPLE never opened). **Fixed**: brand-new opens under $10 are
   bumped to the floor.
5. Fix #4's floor could still round back under $10 after size-precision
   truncation; and top-ups on already-tracked positions kept retrying
   identical doomed sub-$10 orders instead of skipping. **Fixed**: 2% buffer
   on the floor; sub-floor top-ups/reduces are left untouched and retried
   next cycle instead of hitting the exchange.
6. **My own regression, caught same evening**: tried adding `baseShortId` to
   `recordOpen`'s payload as a hypothesis for fixing `recordClose`'s 404
   (see below) — Invo's `/dex/position/create` schema hard-rejects that key
   (`400 unrecognized_keys`). For the ~1h it was live, **every new open
   failed to register with Invo at all** (HL trades themselves were fine).
   **Reverted** the same hour once caught by the next hourly check.

**Still open — `recordClose` 404s on every single close** (`Invo /dex/position/close
404: NOT_FOUND`). Real Hyperliquid close always succeeds; only Invo's own
mimic bookkeeping fails to link up. Two hypotheses tried and disproven:
- Guess: `recordClose`'s `baseShortId` needs to match something told to
  `recordOpen`. Disproven — `recordOpen` doesn't accept a `baseShortId` field
  at all (see #6 above).
- (implicit, untested) `recordOpen`'s response fields (`positionRecordId`,
  `eventId`, `tradeId` — all equal in every observed response) might be what
  `recordClose` actually expects instead of a client baseShortId. **Not yet
  tried** — next candidate to test (see Open questions below).

User instruction (2026-08-09 23:59): no more "unresolved by design" — every
error/incongruence needs real investigation (API probing, web research,
research agents) until either fixed or genuinely exhausted with evidence
documented.

## 2026-08-10 00:xx — recordClose 404 investigation (research agent + fix attempt)

Spawned a research agent to investigate before trying anything further (per user
instruction: no more guessing without real investigation). It read the full
reverse-engineered API surface in this repo, then **cloned the actual upstream
`AKCodez/invo-copy-trader` repo** (not just searched for it) to see how the
original author handled `recordClose`.

**Findings**:
- Upstream's `trade.ts`/`close.ts` are manual one-shot CLI commands, not a
  daemon; a human copy-pastes the client-generated `baseShortId` from open to
  close. The upstream skill doc explicitly claims "use your own
  client-generated baseShortId for /dex/position/close" — but there is **zero
  evidence anywhere in that repo that a close call was ever confirmed to
  return success**; the README's troubleshooting table has a confirmed fix
  for a different 404 (`/dex/trade`, trader's id vs. yours) but nothing for
  `/dex/position/close`. The upstream project likely carries the exact same
  latent 100%-failure bug, just never surfaced since nobody ran it through
  enough manual close cycles to notice.
- WebSearch for Invo/invoapp.com API specifics turned up nothing beyond
  generic app-store listings and the same GitHub repo — no independent public
  documentation of these DEX bookkeeping endpoints exists.
- Structural evidence: `/dex/position/create` hard-rejects an unrecognized
  `baseShortId` key (`400 unrecognized_keys` — confirmed live, see the
  reverted fix above) — meaning the server assigns the position's identity
  itself and returns it (`positionRecordId == eventId == tradeId`, confirmed
  equal across every observed response, different per call). `/dex/position/
  close` then 404s specifically (not 400) — the classic "shape accepted,
  identity not found" signature of a server-side `db.find(clientSuppliedId)`
  that finds nothing, because the server never learned our client-generated
  id at any point.

**Fix attempted** (`bugfix/recordclose-use-server-assigned-id`): capture
`invoResult.data.positionRecordId` (falling back to `tradeId`/`eventId`) from
a successful `recordOpen` call and use THAT as `ourBaseShortId` — the value
later sent as `recordClose`'s `baseShortId` — instead of the client-generated
one from `genBaseShortId()`. `genBaseShortId()` is still used as a fallback
if `recordOpen` fails outright (nothing meaningful to capture) and, unchanged,
for `auto_adopted` positions (which never call `recordOpen` at all, so there's
no server-assigned id to capture regardless).

**Not yet verified against a live close** — positions opened before this
fix still hold the old locally-generated id in `.copy-state.json` and will
still 404 on close until they close and a fresh position opens under the new
logic. Need to watch the next real close of a position opened AFTER this
deploy to confirm `invoResult.success:true` instead of the 404. If it still
fails, hypothesis #2 (trader's own `investment.baseShortId`) is next in line
per the research agent's ranked list.

## 2026-08-10 ~02:23–02:43 CEST — second freeze, ~20 minutes, root-caused live and fixed

User reported the daemon froze again (1-2 min by their initial report; turned
out to be ~20 minutes by the time it was caught), **after** the fetch-timeout
fix above had already deployed — meaning that fix alone wasn't sufficient.
Investigated live, on the actual frozen process, rather than guessing:

- Confirmed frozen in real time: journal showed no new log line for 17+
  minutes while `date` kept advancing.
- `strace -p <pid>` and per-thread `/proc/<pid>/task/*/syscall` showed the
  main thread idle in `do_epoll_wait` (normal Node idle state, not
  informative on its own) and libuv worker threads in `futex_do_wait`
  (also normal/idle) — no thread stuck in a single blocking syscall.
- Ran a battery of live diagnostic scripts (same process, same moment)
  against every read endpoint this codebase calls: all 4 raw HL `/info`
  calls, `sdk.connect()`, `sdk.exchange.updateLeverage()` (real, harmless
  no-op call), and all Invo endpoints (`getFollowedPortfolios`,
  `getOpenInvestments` × 4 portfolios, `getClosedInvestments` × 4,
  including the since-unfollowed `booobsas` portfolio directly by ID) — **every
  single one succeeded in under 2 seconds.** Network to both APIs was
  provably healthy the whole time the daemon was frozen.
- Sent `SIGUSR1` to the live stuck process to activate Node's built-in
  inspector (no restart needed), connected via the raw CDP WebSocket
  protocol (`process.argv`-driven script using Node's native `WebSocket`
  global), and ran `process._getActiveRequests().length` /
  `process._getActiveHandles()` **inside the actual stuck process**:
  `activeRequests: 0`, only 3 idle keep-alive `Socket`/`TLSSocket` handles,
  no pending `Timeout` handle. This directly disproved "hung waiting on a
  request" and "hung on a hanging setTimeout backoff" — the process looked
  completely idle from Node's own accounting, yet made no forward progress
  for 20 minutes.
- Spawned a research agent (WebSearch + reading real `nodejs/undici` GitHub
  issues directly, not just search snippets) specifically on "can
  AbortSignal.timeout()-guarded fetch() hang forever with 0 active
  requests visible." Found a well-corroborated, still-open bug class
  (nodejs/undici#3492, #3905, #4215, #4405, #1926, #2171): undici's
  connection pool can silently reuse a keep-alive socket a remote
  peer/load-balancer already closed without a TCP RST/FIN — the socket
  looks `ESTABLISHED` locally (matches what we saw), a request gets
  written onto it, and the promise never settles because the hang lives
  **inside undici's own pool/socket-reuse state machine**, a code path
  `AbortSignal` (shorthand or manual) does not reliably reach. Undici's own
  internal `headersTimeout` (default 600s) would eventually recover it —
  which is consistent with "many minutes," not "instant failure." This
  spans Node 18 through the current Node 25 (we're on v25.8.1); no evidence
  it's fixed or that a different Node version avoids it.
- **This means my own earlier fetch-timeout fix, while directionally
  correct (bounding calls IS necessary), used the wrong primitive** for
  this specific failure mode — `AbortSignal.timeout()` doesn't reach a hang
  inside undici's pool internals.

**Fix** (`bugfix/undici-keepalive-hang-fix`):
1. Added `undici` as a direct dependency and created
   `src/services/http-dispatcher.ts`, which registers a custom
   `undici.Agent` as the global dispatcher with a short `keepAliveTimeout`
   (2s) and explicit `connectTimeout`/`headersTimeout`/`bodyTimeout` — so
   idle sockets get recycled by undici itself long before a remote/
   intermediary can silently kill them out from under us. This is the
   actual root-cause fix per the research: attack the stale-socket
   problem directly rather than trying to abort around it.
2. Replaced `AbortSignal.timeout()` with the manual `AbortController` +
   `setTimeout` + `clearTimeout` pattern in both `hyperliquid-client.ts`
   and `invo-client.ts`, per the research recommendation (gives a real,
   inspectable timer; not a guaranteed fix for THIS bug class on its own,
   but strictly better practice and cheap to do alongside #1).
3. Added a **separate** defense-in-depth timeout (`withRaceTimeout`,
   `Promise.race`-based) around the HL SDK's own `connect`/`updateLeverage`/
   `placeOrder` calls, which go through axios internally — completely
   outside undici, so fix #1 does not cover them at all. This is a race,
   not a true cancel: the underlying axios request keeps running in the
   background even after we stop waiting on it. Documented the accepted
   residual risk explicitly: for `placeOrder` specifically, an order could
   theoretically still succeed server-side after we've timed out and
   logged it as failed. Judged as a strictly better trade-off than the
   observed alternative (the entire daemon hanging indefinitely).
- Verified: typecheck clean; live test script hit `sdk.connect()` +
  8× `getAllMids()` (exercising keep-alive reuse under the new dispatcher)
  + `invo.getFollowedPortfolios()` back-to-back, all fast, no hangs.
- **Not yet proven this eliminates the freeze** — the actual bug lives in
  undici's internals, which are only mitigated (shorter window for the
  race condition), not eliminated. If it recurs, the next step per the
  research agent's recommendation is logging `dispatcher.stats` (undici
  exposes per-origin connection pool stats) at freeze time to directly
  confirm "N idle connections queued against origin X" rather than
  inferring it, and/or trying `pipelining: 0` on the Agent.

**Separately found and fixed while investigating** (`bugfix/close-positions-for-unfollowed-portfolios`):
the user unfollowed `booobsas` (the account's most active trader, owning 5
of 6 currently-tracked positions) mid-investigation. Checking whether "the
app doesn't know this" causes problems surfaced a real, independent bug:
`Reconciler.run()`'s close-detection loop only ever runs for portfolios
still in the currently-followed list (nested inside the per-portfolio
loop). If a portfolio is unfollowed **entirely** — not just one investment
closing on the trader's side — every `baseId` tracked from it is never
visited by that loop again, ever: permanently orphaned, and invisible to
every other check too (`existing_position_conflict` doesn't apply,
`logUntrackedPositions` doesn't flag it since it's still genuinely
"tracked" in state). Real, live risk: those 5 positions would have sat
forever with zero automated management. **Fixed**: after the per-portfolio
loop, a final pass closes any tracked baseId whose `portfolioId` is set but
no longer in the currently-followed set (manually-`adopt`ed positions have
no `portfolioId` at all and are correctly left untouched). Consistent with
this project's stated design ("mirrors every open/adjust/close from every
portfolio you follow" — unfollowing means stop mirroring, which means
close, not abandon-in-place).

## 2026-08-10 ~01:55 CEST — user's healthcheck monitor reported ~8 minutes of downtime

User got an external healthchecks.io "down" alert (~8 minutes) shortly after
the recordClose deploy. Investigated:

- Live daemon was healthy at time of report: continuous 5-7s reconcile
  cycles, zero errors/fatal, for 1h40m straight.
- The only service restart in the relevant window (00:13:35) was a clean,
  ~2-second systemd stop/start (confirmed via journal timestamps) — nowhere
  near 8 minutes on its own. That alone doesn't explain the report.
- **Root cause found**: none of the 7 raw `fetch()` calls across
  `hyperliquid-client.ts` and `invo-client.ts` (Invo POSTs, HL /info calls)
  had a timeout — only `healthcheck.ts`'s own ping did. A single hung/stalled
  connection on any of them would block the entire `reconciler.run()` cycle
  **indefinitely**, with nothing ever thrown — no error log, no crash, just
  silence, exactly matching "8 minutes down, nothing in the logs." An 8-minute
  silent stall is consistent with a mid-size CDN/load-balancer edge timeout
  on a stalled TCP connection (well short of the OS-level default, which
  would be much longer).
- **Fixed** (`bugfix/fetch-timeouts`): every HL/Invo fetch now has a 15s
  `AbortSignal.timeout`. A stall now surfaces as an ordinary caught error
  (logged, `pingFail` fires) instead of hanging forever; the next 5s poll
  cycle retries normally. Scoped to read/info calls only — deliberately did
  NOT add a timeout to the HL SDK's own `placeOrder`/`updateLeverage` calls
  (order placement), since aborting an order request doesn't guarantee it
  didn't process server-side; retrying after an aborted order risks a
  double-fill. That's a separate, harder problem to solve safely and needs
  more thought before touching it — noted here rather than rushed.
- Verified: typecheck clean, a live dry-run cycle completed normally with the
  change in place (no regressions), state file unaffected.

## 2026-08-10 — overnight/next-day regime starts

User will be unreachable until afternoon. New standing instructions:
- Every 3 hours: pull actual account/portfolio history via the Invo/HL APIs
  directly (not just our own logs) and reconcile against what the daemon
  actually did. Any missed open, unexpected close, or unhandled anything is
  an issue requiring real investigation, not a shrug.
- Authorized to tune risk parameters (margin band, leverage cap, stale-entry
  thresholds) if evidence supports it, not just fix outright bugs — documented.
- Never stop the live daemon under any circumstances; only fix and restart.
- All work through `feature/*`/`bugfix/*` branches off `develop`, merged and
  deleted by me. Never create/touch `hotfix/*`/`release/*`. No pushing.
  Only `develop` and `master` should exist as branches at any given time.


## Heartbeat counter (machine-maintained, do not hand-edit)

Last heartbeat: 2/3 (next wakeup should run heartbeat 3/3, the FULL check) — 2026-08-10T02:18 CEST: healthy, no errors, still no opens/closes to verify recordClose fix
