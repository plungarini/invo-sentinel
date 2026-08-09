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

