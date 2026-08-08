# invo-sentinel

Automatic copy trading for [Invo](https://app.invoapp.com) followed portfolios, executed on [Hyperliquid](https://hyperliquid.xyz). A plain polling daemon mirrors every open, margin adjustment, and close from every trader you already follow, with one guardrail: your margin per trade is always clamped into a `[min%, max%]` band of your own equity, and leverage is capped. **Trades are never skipped, only resized.** It watches every followed portfolio and stands in for you, on your own risk terms.

## Relationship to the original project

This started from [`AKCodez/invo-copy-trader`](https://github.com/AKCodez/invo-copy-trader), which reverse-engineered the same Invo + Hyperliquid API surface but designed around a Claude Code agent making the discovery/follow/copy decisions interactively. `invo-sentinel` keeps the reverse-engineered API knowledge and the Hyperliquid execution primitives (order placement, signing quirks), but replaces the AI decision loop entirely with deterministic, mechanical logic. See [Design notes](#design-notes) for what changed and why.

## What it actually does

Every poll cycle (default 5s):

1. Fetches the list of portfolios you follow (`get_users_followed_portfolios`); refreshed every cycle, so following someone new shows up on the very next poll.
2. For each one, fetches their **currently open** investments (`get_investments`, `isOpen: true`); this is the full picture every time, not an event stream, so it doubles as backfill: the very first cycle after startup already reflects everything currently open, not just things that open after the daemon starts.
3. For each open trade: computes your target margin from the trader's own margin %, clamped into your configured band, and places whatever delta order (open / increase / reduce) is needed to get there. Leverage is capped the same way.
4. For anything you're tracking that's no longer in that trader's open list: closes it fully on Hyperliquid, unclamped.
5. Cross-checks your real Hyperliquid positions against what's tracked, and flags anything untracked instead of silently ignoring it.

## Quick start

```bash
npm install
cp .env.example .env
# fill in .env; see Credentials below
npm run preflight        # 10-ish sanity checks: env, HL connection, Invo auth, balance
npm run dry-run           # watch it decide without placing any real orders
./scripts/run.sh          # go live, with auto-restart on crash
```

Run it somewhere that stays on; a closed laptop lid or terminal kills a foreground process. Use `tmux`/`screen`, or a real process supervisor (`pm2 start scripts/run.sh`, or a systemd unit with `Restart=always`).

## Credentials

Create `.env` (see `.env.example`):

```
INVO_REFRESH_TOKEN=eyJ...
HL_AGENT_KEY=0x...
WALLET_ADDRESS=0x...
```

**`INVO_REFRESH_TOKEN`** (~350 day TTL). Log into `app.invoapp.com` in Chrome, open DevTools console, and run:

```javascript
const aesKeyB64 = localStorage.getItem('FlutterSecureStorage');
const encryptedRefresh = localStorage.getItem('FlutterSecureStorage.REFRESH_TOKEN');
const [ivB64, ctB64] = encryptedRefresh.split('.');
const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
const keyBytes = Uint8Array.from(atob(aesKeyB64), (c) => c.charCodeAt(0));
const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct);
console.log(new TextDecoder().decode(decrypted)); // 3 dot-separated parts; that's your token
```

**`HL_AGENT_KEY`** (~90 day TTL). DevTools → Application → IndexedDB → `invo_hl_agents` → `agents` → `current` → `privateKey`.

**`WALLET_ADDRESS`**: your Invo profile, or DevTools → Application → Local Storage → value of `flutter.hl.masterAddress`.

## Risk configuration

```
MIN_MARGIN_PCT=2      # never risk less than this % of your equity per trade
MAX_MARGIN_PCT=5      # never risk more than this %, no matter what the trader did
MAX_LEVERAGE=30        # leverage is capped here, not rejected; blank = no cap
POLL_INTERVAL_MS=5000
LOG_RETENTION_HOURS=24
LOG_MAX_TOTAL_MB=200
```

`MIN_MARGIN_PCT`/`MAX_MARGIN_PCT` can also be passed positionally, overriding `.env`: `npm run start -- 2 5`.

## Commands

| Command                                                                 | What it does                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run preflight`                                                     | Env, Hyperliquid connection, Invo auth, balance/positions; run this first     |
| `npm run dry-run`                                                       | Full pipeline, no real orders; everything is logged as `dry_run_*`            |
| `npm start` / `./scripts/run.sh`                                        | The real thing. `run.sh` adds auto-restart on crash                           |
| `npm run adopt -- <baseId> <coin> <long\|short> <leverage> <marginUsd>` | Manually resolve a same-coin-multiple-traders conflict (see below)            |
| `npm run close -- <coin>`                                               | Emergency manual close; stopping the daemon does **not** close open positions |

## Resolving pre-existing positions when traders overlap

Hyperliquid nets positions **by coin**, not by trader, so if you already have a real position that predates the daemon, it has to figure out which followed trader's investment it belongs to before it can adopt it:

1. **Wrong direction** (e.g. your real position is long, a candidate is short) → that candidate is immediately ruled out, no API call needed.
2. **Right direction, and no other followed trader shares both this coin and this direction** → unambiguous, auto-adopted instantly, no order placed.
3. **Right direction, and another followed trader shares it too** (e.g. two traders both long the same coin) → asks Invo's own mimic-tracking (`/dex/trade`'s `isMimicked` / `unmimickedCount` fields, keyed by the trader's `baseShortId`) which one you actually mimicked through the app; this is ground truth, not a guess, since it's Invo's own record of what you clicked "Mimic" on. See `src/core/mimic-resolver.ts`.
4. Only if step 3 comes back inconclusive (no update history yet to carry the signal, or; vanishingly rarely; more than one candidate confirms) does it give up and log `existing_position_conflict`, leaving that position untouched until you run `npm run adopt` or close it manually.

In practice, step 3 is rare; most same-coin overlaps resolve at step 1 or 2 once direction is actually factored in.

**Known limitation**: only one trader's investment can be _tracked_ per coin at a time, even after the above resolves which one that is. If a second followed trader later opens a position in a coin you're already tracking (from a different trader), it's flagged as `existing_position_conflict` rather than tracked alongside the first; per-baseId delta sizing assumes a tracked baseId owns the _entire_ real position on that coin, which breaks the moment two do. Supporting true multi-trader aggregation on one coin (summing each trader's share of the net position) would need state keyed by `(coin, direction)` rather than by baseId; a bigger change, not implemented here.

## Logs

`logs/auto-copy-YYYY-MM-DD.log`, one JSON line per event, mirrored to stdout. Retention is enforced two ways at once: files older than `LOG_RETENTION_HOURS` are deleted, and the whole directory is capped at `LOG_MAX_TOTAL_MB` (oldest evicted first); so a burst of activity can't fill the disk even inside the retention window.

## Design notes

Things worth knowing if you're reading the code or extending it:

- **Not the social feed.** `posts/get_feed` (what the original repo's `monitor.ts` used) has a real, confirmed server-side pagination bug, plus an inherent 1-10s propagation delay. This project uses `get_investments(isOpen: true)` per followed portfolio instead; a direct current-state snapshot, no history-walking, no pagination limit. `posts/get_feed` isn't called anywhere in this codebase.
- **`entrySize` is a percent, not a fraction.** A trader's `entrySize: 0.2` means their margin is 0.20% of _their_ balance; confirmed against the Invo app UI, not documented anywhere. This project reapplies that same percent against _your_ equity, clamped to your configured band.
- **No exchange-side TP/SL.** This account's phantom-agent key signing has two independently confirmed breakages tied to specific Hyperliquid order fields; `reduce_only: true`, and `grouping: 'normalTpsl'` (both silently produce wrong signature recovery). A stop/trigger order is a third, never-tested field combination on that same fragile signer. Exits mirror the trader's own close instead.
- **Leverage/margin are capped, never a reason to skip.** The philosophy throughout: never refuse a trade for being "too risky"; resize it into the configured band instead.
- **Rate limits**: Invo POSTs back off on `429` (honoring `Retry-After` if present, otherwise exponential: 1s/2s/4s) before giving up and surfacing the error to that cycle's logs; the next poll cycle tries again regardless.

## Disclaimer

This relies on reverse-engineered, undocumented Invo and Hyperliquid APIs that can change or break without notice. Copy trading and leverage are inherently risky; past performance of any trader doesn't predict future results. You are solely responsible for your own trading decisions, credential security, and compliance with applicable law. Use at your own risk; provided as-is, no warranty.

## License

MIT.
