import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';

// Lossless PNG at the exact viewport size (no devicePixelRatio scaling) is what
// makes these sharp - a browser-extension screenshot tool that re-encodes to a
// downscaled JPEG (like a remote-control MCP browser) visibly degrades text and
// gradients by comparison, even at a similar pixel count.
const VIEWPORT = { width: 1440, height: 900 };

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://invo.pi';

const PAGES: { path: string; file: string; waitForText: string }[] = [
	{ path: '/', file: 'overview.png', waitForText: 'Total Balance' },
	{ path: '/analytics', file: 'analytics.png', waitForText: 'Cumulative PnL' },
	{ path: '/wallet', file: 'wallet.png', waitForText: 'Total Balance' },
	{ path: '/tools', file: 'tools.png', waitForText: 'Portfolio Analysis' },
];

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: VIEWPORT });

	for (const { path, file, waitForText } of PAGES) {
		await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle' });
		// The dashboard hydrates and fetches its own data client-side after the
		// initial HTML - `networkidle` alone still lands mid-skeleton, so wait
		// for text that only appears once real data has rendered.
		await page.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 15_000 });
		await page.waitForTimeout(500); // lets in-flight SWR revalidations settle so numbers aren't caught mid-flicker
		const dest = fileURLToPath(new URL(`../docs/screenshots/${file}`, import.meta.url));
		await page.screenshot({ path: dest });
		console.log(`saved ${file}`);
	}

	await browser.close();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
