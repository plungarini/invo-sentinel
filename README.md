# invo-sentinel

[![GitHub stars](https://img.shields.io/github/stars/plungarini/invo-sentinel?style=social)](https://github.com/plungarini/invo-sentinel)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-donate-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/wheresbebo)

Automatic copy trading for [Invo](https://app.invoapp.com) portfolios, executed on [Hyperliquid](https://hyperliquid.xyz).

A plain polling daemon mirrors every open, margin adjustment, and close from every trader you follow. One guardrail: your margin per trade is always clamped into a `[min%, max%]` band of your own equity, and leverage is capped. **Trades are never skipped for being "too risky", only resized.** The one exception is a trade that is already stale and profitable by the time it is first seen (see [Skipping stale entries](#skipping-stale-already-profitable-entries)).

Forked from [`AKCodez/invo-copy-trader`](https://github.com/AKCodez/invo-copy-trader). Kept the reverse-engineered API and signing knowledge; replaced the AI decision loop with deterministic logic.

> [!IMPORTANT]
> **⭐ Star this repo if it's useful to you.**
> It's how other copy-traders find the project, and the only feedback signal it gets. [Click here](https://github.com/plungarini/invo-sentinel) 🙏

## Contents

- [What it does](#what-it-does)
- [Easy install (no terminal)](#easy-install-no-terminal)
- [Quick start (from source)](#quick-start-from-source)
- [Credentials](#credentials)
- [Risk configuration](#risk-configuration)
- [Commands](#commands)
- [Dashboard UI](#dashboard-ui)
- [Auditing](#auditing)
- [Running continuously](#running-continuously)
- [Same-coin conflicts between traders](#same-coin-conflicts-between-traders)
- [Manual intervention](#manual-intervention)
- [Support](#support)
- [Disclaimer](#disclaimer)

## What it does

Every poll cycle (default 5s):

1. Fetches the portfolios you follow.
2. Fetches each one's **currently open** investments. This is a full snapshot, not an event stream, so a restart never misses anything.
3. For each open trade, computes your target margin from the trader's own margin %, clamps it into your band, and places whatever delta order gets you there. Leverage is capped the same way.
4. Closes anything you track that has left a trader's open list, fully and unclamped.
5. Cross-checks your real Hyperliquid positions against what is tracked, and flags anything untracked.

## Easy install (no terminal)

For anyone who just wants it running, without `git clone` or a terminal. Windows, macOS, and Linux each get their own release build.

1. Download the archive for your OS from [Releases](../../releases) and unzip it anywhere: `invo-sentinel-windows-x64.zip`, `invo-sentinel-macos-arm64.zip`, `invo-sentinel-linux-x64.zip`, or `invo-sentinel-linux-arm64.zip` (Raspberry Pi 4/5 and other arm64 boards).
2. Open `GETTING-STARTED.txt` inside. It is a short, platform-specific version of this section.
3. Run `start.bat` (Windows: double-click) or `./start.sh` (macOS/Linux: from a terminal; macOS also needs a one-time Gatekeeper bypass, see `GETTING-STARTED.txt`).

`start.bat` / `start.sh` is the only thing you run. It starts the daemon and the dashboard UI, opens the UI in your browser, and restarts the daemon if it crashes. A console window stays open while it runs; closing it stops everything. Add `--background` to free the window immediately, or see [Running continuously](#running-continuously) to keep it running across reboots.

Everything starts idle and waits for the 3 values from [Credentials](#credentials). Nothing crashes if they are missing; the dashboard's setup wizard is the easiest way to supply them.

**One dependency the daemon itself does not have:** the dashboard UI needs [Node.js](https://nodejs.org). The daemon is a self-contained executable and needs nothing. If Node is missing, the wrapper says so and still starts the daemon alone.

## Quick start (from source)

The developer path: clone the repo and run it with Node. The easy-install path above exists to avoid this.

```bash
npm install
cp .env.example .env
# fill in .env - see Credentials below
npm run preflight   # sanity checks: env, HL connection, Invo auth, balance
npm run dry-run     # watch it decide without placing real orders
./scripts/run.sh    # go live, with auto-restart on crash; also starts the dashboard UI
```

Run it somewhere that stays on. A closed laptop lid kills a foreground process. See [Running continuously](#running-continuously) for a real supervisor.

## Credentials

Create `.env` (see `.env.example`):

```
INVO_REFRESH_TOKEN=eyJ...
HL_AGENT_KEY=0x...
WALLET_ADDRESS=0x...
```

**`INVO_REFRESH_TOKEN`** (~350 day TTL). Log into `app.invoapp.com` in Chrome, open the DevTools console, and run:

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

**`HL_AGENT_KEY`** (~90 day TTL). DevTools -> Application -> IndexedDB -> `invo_hl_agents` -> `agents` -> `current` -> `privateKey`.

**`WALLET_ADDRESS`**. DevTools -> Application -> Local Storage -> value of `flutter.hl.masterAddress`.

## Risk configuration

```
MIN_MARGIN_PCT=2      # never risk less than this % of your equity per trade
MAX_MARGIN_PCT=5      # never risk more than this %, whatever the trader did
MAX_LEVERAGE=30       # leverage is capped here, not rejected; blank = no cap
STALE_ENTRY_MAX_AGE_MINUTES=1
STALE_ENTRY_MAX_PROFIT_PCT=1
POLL_INTERVAL_MS=5000
LOG_RETENTION_HOURS=24
LOG_MAX_TOTAL_MB=200
HEALTHCHECK_PING_URL=  # optional dead-man's-switch ping (e.g. healthchecks.io)
```

`MIN_MARGIN_PCT` and `MAX_MARGIN_PCT` can also be passed positionally, overriding `.env`: `npm run start -- 2 5`.

Any followed portfolio can have its own margin band. Edit `data/.copy-portfolio-risk.json`, which is auto-created and kept in sync with who you follow. Your edits are never overwritten.

### Skipping stale, already-profitable entries

The one exception to "never skip, only resize":

- An entry older than `STALE_ENTRY_MAX_AGE_MINUTES` is **permanently** skipped, whatever its current PnL. This matters most right after a same-coin conflict clears (see [below](#same-coin-conflicts-between-traders)): opening a long-stale idea fresh at 0% PnL is not really mirroring it.
- An entry still inside that window but already up more than `STALE_ENTRY_MAX_PROFIT_PCT`% is skipped for that cycle only, then re-checked next time.

### Hyperliquid's minimum order size

Hyperliquid rejects any order under $10 notional. A brand-new open that computes under that floor is bumped up to just over $10. An incremental top-up that lands under $10 is left alone and retried next cycle, once the target has drifted further.

## Commands

| Command                                                                 | What it does                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run preflight`                                                     | Env, Hyperliquid connection, Invo auth, balance. Run this first.          |
| `npm run dry-run`                                                       | Full pipeline, no real orders; everything logged as `dry_run_*`.          |
| `npm start` / `./scripts/run.sh`                                        | The real thing. `run.sh` adds auto-restart on crash.                      |
| `npm run adopt -- <baseId> <coin> <long\|short> <leverage> <marginUsd>` | Manually resolve a same-coin conflict between traders.                    |
| `npm run close -- <coin>`                                               | Emergency manual close. Stopping the daemon does **not** close positions. |
| `npm run reconcile -- --hours=6`                                        | Read-only audit. See [Auditing](#auditing).                               |

## Dashboard UI

A local-only, read-only Next.js dashboard in `ui/`. It views daemon state and Invo/Hyperliquid data. It places no orders and never writes to any daemon file.

```bash
cd ui && npm install    # one-time
npm run ui:dev           # dev server, from repo root
npm run ui:build         # production build
npm run ui:start         # serve the production build
```

Port defaults to 4400; copy `ui/.env.local.example` to `ui/.env.local` to change it. It is a fully separate process from the daemon and safe to run alongside it.

- **Overview** - balance, open positions, all-time PnL and win rate, daemon health, credential expiry, recent activity.
- **Analytics** - cumulative PnL over time, win rate, trade stats, breakdowns by portfolio and by coin, all net of fees.
- **Wallet** - live open positions with full detail, paginated trade history with a per-trade timeline, deposit/withdrawal history.
- **Tools -> Portfolio Analysis** - look up any Invo portfolio by ID, followed or not, with its real stats from Invo's API.
- **Settings** - full daemon setup and preferences.

![Overview](docs/screenshots/overview.png)
![Analytics](docs/screenshots/analytics.png)
![Wallet](docs/screenshots/wallet.png)
![Tools](docs/screenshots/tools.png)
![Settings](docs/screenshots/settings.png)

The right rail lists your followed portfolios; clicking one opens the same detail view as the Tools page.

## Auditing

The daemon's own logs record what it _decided_, not proof it was right. `npm run reconcile -- --hours=6` cross-checks recent behavior against two sources the live daemon never consults: Invo's closed-investment history and Hyperliquid's own fill history.

It flags anything that does not add up: an unexplained untracked open, a close it missed or was slow on, a fill it cannot verify, or a position that closed with no daemon record of it (for example, something else with signing authority over the same wallet closed it). Read-only, places no orders.

## Running continuously

`scripts/run.sh`, `start.bat`, and `start.sh` restart the daemon if it exits, but nothing brings it back after a reboot. For that, use your OS's service manager.

**Windows (packaged `start.bat`, no admin rights):**

A Startup-folder shortcut runs `start.bat` at login, and `start.bat`'s own loop handles restart-on-crash:

1. Press `Win+R`, type `shell:startup`, Enter.
2. Right-click -> New -> Shortcut, point it at `start.bat` where you unzipped the release, and set its `Start in` folder (Shortcut Properties) to that same directory.

To run before any user logs in, use **Task Scheduler**: Create Task -> Triggers -> "At startup" -> Actions -> Start a program (`start.bat`, "Start in" set to its folder) -> Settings -> "Restart the task if it fails". Task Scheduler also recovers from the console window being closed, not just the daemon crashing.

**Linux (systemd user service, no `sudo`):**

```bash
loginctl enable-linger "$USER"   # one-time: let user services run without a login session
```

Create `~/.config/systemd/user/invo-sentinel.service` (use absolute paths from `readlink -f .` and `which npx`):

```ini
[Unit]
Description=Invo Sentinel
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

```bash
systemctl --user daemon-reload
systemctl --user enable --now invo-sentinel.service
systemctl --user status invo-sentinel.service   # should say "active (running)"
```

**Other options:** [pm2](https://pm2.keymetrics.io/) (`pm2 start "npx tsx src/cli/auto-copy.ts" --name invo-sentinel`, then `pm2 save && pm2 startup`), Docker (`--restart=always`), or macOS **launchd**.

## Same-coin conflicts between traders

Hyperliquid nets positions by coin, not by trader. If a real position could belong to more than one followed trader:

1. Wrong direction versus that trader -> ruled out immediately.
2. Right direction, no other follower shares it -> auto-adopted, unambiguous.
3. Shared with another follower -> resolved by decoding the order's `cloid`, which Invo's own client encodes with the trader's id. Exact, not a guess.
4. Still inconclusive -> flagged as `existing_position_conflict`, left untouched until `npm run adopt` or a manual close.

**Known limitation:** only one trader's investment is tracked per coin at a time. A second trader opening the same coin is flagged as a conflict, not aggregated.

## Manual intervention

You are always free to act directly on Hyperliquid. The daemon detects it and adapts instead of fighting you:

- **Manual close** of a tracked position -> detected next cycle; it permanently stops managing that trade. A later trade from the same trader gets a fresh id and is mirrored normally.
- **Manual resize** -> recalculated from the real size before its next order.
- **Manual direction flip** -> treated like a manual close.
- **Manual open or edit on an untracked coin** -> left alone, flagged as informational.

## Support

<div align="center">

This is a free, unaffiliated side project.

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-donate-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/wheresbebo)
&nbsp;
[![Star on GitHub](https://img.shields.io/github/stars/plungarini/invo-sentinel?style=for-the-badge&logo=github&label=Star%20this%20repo&color=yellow)](https://github.com/plungarini/invo-sentinel)

If it is making you money, or just saved you from building your own, a coffee or a star genuinely helps.

</div>

## Disclaimer

This relies on reverse-engineered, undocumented Invo and Hyperliquid APIs that can change or break without notice. Copy trading and leverage are inherently risky; a trader's past performance does not predict future results. You are solely responsible for your own trading decisions, credential security, and compliance with applicable law. Use at your own risk; provided as-is, no warranty.

The dashboard UI displays data reverse-engineered from Invo's app for personal use only. Not endorsed by, affiliated with, or sponsored by Invo.

## License

MIT licensed.
