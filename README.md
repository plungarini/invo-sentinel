# invo-sentinel

Automatic copy trading for [Invo](https://app.invoapp.com) followed portfolios, executed on [Hyperliquid](https://hyperliquid.xyz). A plain polling daemon mirrors every open, margin adjustment, and close from every trader you already follow, with one guardrail: your margin per trade is always clamped into a `[min%, max%]` band of your own equity, and leverage is capped. **Trades are never skipped for being "too risky", only resized** — the one deliberate exception is a trade that's already stale and profitable by the time it's seen (see [Skipping stale, already-profitable entries](#skipping-stale-already-profitable-entries)). It watches every followed portfolio and stands in for you, on your own risk terms.

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

Run it somewhere that stays on; a closed laptop lid or terminal kills a foreground process. See [Running continuously](#running-continuously-survive-reboots-and-crashes) below for a real process supervisor setup — a terminal window or `tmux` session is fine for testing, but isn't enough on its own for something meant to run unattended.

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
STALE_ENTRY_MAX_AGE_MINUTES=1  # see "Skipping stale, already-profitable entries" below
STALE_ENTRY_MAX_PROFIT_PCT=1
POLL_INTERVAL_MS=5000
LOG_RETENTION_HOURS=24
LOG_MAX_TOTAL_MB=200
HEALTHCHECK_PING_URL=  # optional — see "External monitoring" below
```

`MIN_MARGIN_PCT`/`MAX_MARGIN_PCT` can also be passed positionally, overriding `.env`: `npm run start -- 2 5`.

### Skipping stale, already-profitable entries

Margin and leverage are only ever resized, never a reason to reject a trade — with one deliberate exception, gated on freshness first, PnL second:

- **Older than `STALE_ENTRY_MAX_AGE_MINUTES`** → permanently skipped, no matter its current PnL. This is the primary gate: a trade idea past its freshness window doesn't get a second look based on how it happens to be doing at the exact moment this daemon considers it.
- **Still within that window, but already up more than `STALE_ENTRY_MAX_PROFIT_PCT`%** (its own leveraged PnL%, not raw price move) → skipped for *this cycle only*, not permanently. A trade that pumped immediately at entry can still cool back off before the window expires; it's re-checked fresh next cycle. Once the window does expire, the permanent rule above takes over regardless of PnL.

This matters most right after a same-coin conflict clears: say trader A and trader B both hold BTC, so only A's investment gets tracked (see [Resolving pre-existing positions](#resolving-pre-existing-positions-when-traders-overlap) below) while B's sits flagged as a conflict, untouched, however long it's actually been open. The moment A closes, the coin frees up — but B's trade idea is exactly as old as it ever was. Opening it fresh at that point, at 0% PnL and full size, isn't mirroring what B actually did; it's a new bet wearing B's sizing, so it's blocked purely on age, whatever B's PnL happens to be right then. The same rule also catches the case without any conflict involved — any investment that's simply already old by the time this daemon first sees it, e.g. on startup.

A permanent skip is recorded in `.copy-ignored.json`, separate from `.copy-state.json` (only real tracked positions live there), and logged once as `stale_entry_ignored`. A temporary, still-fresh skip is logged as `fresh_entry_profit_skip` and doesn't touch `.copy-ignored.json` at all. The moment a permanently-ignored baseId actually closes on the trader's side, its ignore entry is cleared too — a future trade from the same trader gets its own new baseId regardless.

### Hyperliquid's minimum order size

Hyperliquid rejects any order below $10 notional outright, independent of anything this project configures. On a small account with a tight `MIN_MARGIN_PCT`/`MAX_MARGIN_PCT` band and a low-leverage coin, the clamped target margin can easily compute to a notional under that floor — a real trade that would otherwise just never open, cycle after cycle, until it's eventually skipped by the stale-entry rule above for having gone unfilled too long.

Consistent with "resize, don't skip": a **brand-new open** whose computed order would land under $10 is bumped up to just over $10 notional (a small buffer, since rounding the order size to the coin's tick precision can otherwise undershoot back below the floor and get rejected right back) instead of being attempted at the smaller size. An **incremental top-up** (or a small reduce) on an already-tracked position that lands under $10 genuinely cannot be placed at all — Hyperliquid would reject it identically every cycle — so it's left completely untouched and retried next cycle once `targetMarginUsd` has drifted further, rather than repeatedly hammering the exchange with an order guaranteed to fail.

Any order Hyperliquid still rejects for another reason is logged as `order_rejected` and left completely untouched — no state or Invo record is written for it — so the exact same delta is retried again next cycle instead of silently corrupting local tracking.

### External monitoring (optional)

Set `HEALTHCHECK_PING_URL` to a ping URL from a "dead man's switch" style monitor (e.g. [healthchecks.io](https://healthchecks.io)) and the daemon will ping it every cycle with no effect on trading if the monitor itself is slow or unreachable — every ping is fire-and-forget, never awaited by the trading logic:

- `<url>/start` at the beginning of each poll cycle.
- `<url>` (plain, success) at the end of a cycle that completed without error — paired with the `/start` ping, this is what lets the monitor show per-cycle run time, not just up/down.
- `<url>/fail` at the end of a cycle that threw, and also (best-effort, briefly awaited so it has a real chance to leave before the process exits) right before the process exits on an uncaught exception — an immediate failure signal instead of waiting for a missed-ping timeout to notice the daemon is down.

Leave it unset and none of this runs at all.

## Commands

| Command                                                                 | What it does                                                                  |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run preflight`                                                     | Env, Hyperliquid connection, Invo auth, balance/positions; run this first     |
| `npm run dry-run`                                                       | Full pipeline, no real orders; everything is logged as `dry_run_*`            |
| `npm start` / `./scripts/run.sh`                                        | The real thing. `run.sh` adds auto-restart on crash                           |
| `npm run adopt -- <baseId> <coin> <long\|short> <leverage> <marginUsd>` | Manually resolve a same-coin-multiple-traders conflict (see below)            |
| `npm run close -- <coin>`                                               | Emergency manual close; stopping the daemon does **not** close open positions |

## Running continuously (survive reboots and crashes)

`scripts/run.sh` restarts the daemon if the process itself exits, but that's only half the problem: nothing brings it back after the machine reboots, and nothing starts it in the first place if you're not logged in (e.g. a headless box, or a Raspberry Pi that lost power and came back up). For that you want the OS's own service manager. On Linux, that's **systemd**, and it's already installed on essentially every mainstream distribution (Raspberry Pi OS, Ubuntu, Debian, Fedora, Arch, ...) — no extra software to install.

This uses a **user service**, not a system-wide one: no `sudo` required, and it keeps a process that holds real trading credentials entirely inside your own user account rather than running as root.

### 1. One-time: allow user services to start without a login session

By default, a user's systemd services stop when their last session logs out, and don't start until they log back in — not what you want on a box that reboots unattended. Enable "lingering" once, for your own user:

```bash
loginctl enable-linger "$USER"
```

Check it took effect: `loginctl show-user "$USER"` should include `Linger=yes`.

### 2. Find the absolute paths you'll need

The service file can't rely on your shell's `PATH`, login scripts, or `~` expansion — everything must be an absolute path. Find yours:

```bash
readlink -f .            # absolute path to this repo — call it <repo-path>
which npx                # absolute path to npx — call it <npx-path>
dirname "$(which npx)"   # the directory to put on PATH below — call it <npx-dir>
```

If you installed Node via `nvm`, `<npx-path>`/`<npx-dir>` will be somewhere under `~/.nvm/versions/node/<version>/bin` — that's expected and fine, just use the real resolved path, not one with `~` or `$HOME` in it.

### 3. Create the service file

Create `~/.config/systemd/user/invo-sentinel.service` (substitute your own `<repo-path>` and `<npx-dir>` from step 2):

```ini
[Unit]
Description=Invo Sentinel - automatic Invo->Hyperliquid copy trading daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=<repo-path>
Environment=PATH=<npx-dir>:/usr/local/bin:/usr/bin:/bin
ExecStart=<npx-dir>/npx tsx src/cli/auto-copy.ts
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

`WorkingDirectory` is what makes `.env` and `.copy-state.json` resolve correctly (both are loaded/saved relative to the repo root) — this is the one setting most worth double-checking if something doesn't come up right.

To pass a risk-band override instead of relying on `.env`, add it to `ExecStart`: `ExecStart=<npx-dir>/npx tsx src/cli/auto-copy.ts 2 5`.

### 4. Enable and start it

```bash
systemctl --user daemon-reload
systemctl --user enable invo-sentinel.service   # survives reboots from here on
systemctl --user start invo-sentinel.service
```

### 5. Verify it's actually running, and that a crash really recovers

```bash
systemctl --user status invo-sentinel.service          # should say "active (running)"
journalctl --user-unit invo-sentinel -f                 # live tail (logs/*.log also still gets written)
```

Prove the crash-recovery actually works rather than assuming it — this sends an unrecoverable signal, harder to survive than any error the app could catch on its own:

```bash
kill -9 "$(systemctl --user show -p MainPID --value invo-sentinel.service)"
sleep 5
systemctl --user status invo-sentinel.service   # should already be "active (running)" again, new PID
```

### Common commands

| Command | What it does |
|---|---|
| `systemctl --user restart invo-sentinel.service` | Pick up a code or `.env` change |
| `systemctl --user stop invo-sentinel.service` | Stop it (does **not** close open positions — see `npm run close`) |
| `systemctl --user disable invo-sentinel.service` | Turn off auto-start on boot, without touching whether it's currently running |
| `systemctl --user show -p NRestarts invo-sentinel.service` | How many times it's had to restart — rising unexpectedly is worth investigating in the logs |

### Not on Linux, or don't want systemd

The same idea (start on boot, restart on crash, no login required) is available elsewhere:

- **pm2** (cross-platform Node process manager): `pm2 start "npx tsx src/cli/auto-copy.ts" --name invo-sentinel`, then `pm2 save` and `pm2 startup` (the latter prints an OS-specific command to run once, which wires pm2 itself into your OS's startup system).
- **Docker**: run the repo in a container with `restart: always` (Compose) or `--restart=always` (plain `docker run`) — Docker's own daemon then handles both crash-restart and start-on-boot.
- **launchd** (macOS): the native equivalent of systemd; same shape as above (a plist with `KeepAlive` and `RunAtLoad`, installed under `~/Library/LaunchAgents/`).

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
- **Leverage/margin are capped, never a reason to skip.** The philosophy throughout: never refuse a trade for being "too risky"; resize it into the configured band instead. The one deliberate exception: a stale, already-profitable entry is skipped outright rather than resized — see [Skipping stale, already-profitable entries](#skipping-stale-already-profitable-entries).
- **Rate limits**: Invo POSTs back off on `429` (honoring `Retry-After` if present, otherwise exponential: 1s/2s/4s) before giving up and surfacing the error to that cycle's logs; the next poll cycle tries again regardless.

## Disclaimer

This relies on reverse-engineered, undocumented Invo and Hyperliquid APIs that can change or break without notice. Copy trading and leverage are inherently risky; past performance of any trader doesn't predict future results. You are solely responsible for your own trading decisions, credential security, and compliance with applicable law. Use at your own risk; provided as-is, no warranty.

## License

MIT.
