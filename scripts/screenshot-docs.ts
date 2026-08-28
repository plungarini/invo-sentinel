import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

// Lossless PNG at the exact viewport size (no devicePixelRatio scaling) is what
// makes these sharp - a browser-extension screenshot tool that re-encodes to a
// downscaled JPEG (like a remote-control MCP browser) visibly degrades text and
// gradients by comparison, even at a similar pixel count.
const VIEWPORT = { width: 1440, height: 900 };

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://invo.pi';

// The dashboard holds an open SSE stream (walletBroadcaster) plus SWR polling,
// so it never reaches Playwright's `networkidle`. Wait on real content text
// instead, generously - a Raspberry Pi serving this under daemon load is slow,
// and a mid-restart UI can 502 briefly (see ui-supervisor.ts). One reload retry
// covers that.
const CONTENT_TIMEOUT_MS = 30_000;

const PAGES: { path: string; file: string; waitForText: string }[] = [
	{ path: '/', file: 'overview.png', waitForText: 'Total Balance' },
	{ path: '/analytics', file: 'analytics.png', waitForText: 'Cumulative PnL' },
	{ path: '/wallet', file: 'wallet.png', waitForText: 'Total Balance' },
	{ path: '/tools', file: 'tools.png', waitForText: 'Portfolio Analysis' },
	{ path: '/settings', file: 'settings.png', waitForText: 'Settings' },
];

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: VIEWPORT });
	page.setDefaultTimeout(CONTENT_TIMEOUT_MS);
	page.setDefaultNavigationTimeout(CONTENT_TIMEOUT_MS);

	const failed: string[] = [];

	for (const { path, file, waitForText } of PAGES) {
		const url = `${BASE_URL}${path}`;
		let saved = false;
		for (let attempt = 1; attempt <= 2 && !saved; attempt++) {
			try {
				await page.goto(url, { waitUntil: 'domcontentloaded' });
				await page.getByText(waitForText, { exact: false }).first().waitFor();
				await page.waitForTimeout(500); // let in-flight SWR revalidations settle so numbers aren't caught mid-flicker
				const dest = fileURLToPath(new URL(`../docs/screenshots/${file}`, import.meta.url));
				await page.screenshot({ path: dest });
				console.log(`saved ${file}`);
				saved = true;
			} catch (e) {
				const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
				if (attempt === 1) {
					console.warn(`retrying ${file} (${msg})`);
				} else {
					console.error(`FAILED ${file}: ${msg}`);
					failed.push(file);
				}
			}
		}
	}

	await browser.close();
	if (failed.length) process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
