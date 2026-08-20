import type { Logger } from './logger.js';

// Hardcoded, never derived from any runtime-supplied value - this is the one
// thing that must never be data-driven, or a compromised config could point
// the updater at an attacker-controlled release feed.
const REPO = 'plungarini/invo-sentinel';
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const USER_AGENT = 'invo-sentinel-auto-updater';

export interface ReleaseAsset {
	name: string;
	downloadUrl: string;
}

export interface LatestRelease {
	version: string;
	htmlUrl: string;
	assets: ReleaseAsset[];
}

export interface PlatformAsset {
	zip: ReleaseAsset;
	checksums: ReleaseAsset;
}

export interface UpdateCheckResult {
	updateAvailable: boolean;
	currentVersion: string;
	latestVersion: string;
	asset?: PlatformAsset;
}

/**
 * Plain numeric x.y.z compare - this repo's tags are always this shape, no
 * `v` prefix, no pre-release suffix (see CLAUDE.md's packaging section: tags
 * match `package.json`'s version exactly). Missing/malformed segments
 * compare as 0. Returns >0 if a>b, <0 if a<b, 0 if equal.
 */
export function compareVersions(a: string, b: string): number {
	const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
	const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** The exact asset-name convention build-release.yml produces, keyed by the runtime's own platform+arch - only the 4 combinations that workflow's matrix actually builds; anything else has no asset to find. */
export function platformAssetBaseName(platform = process.platform, arch = process.arch): string | null {
	if (platform === 'win32' && arch === 'x64') return 'invo-sentinel-windows-x64';
	if (platform === 'linux' && arch === 'x64') return 'invo-sentinel-linux-x64';
	if (platform === 'darwin' && arch === 'arm64') return 'invo-sentinel-macos-arm64';
	if (platform === 'linux' && arch === 'arm64') return 'invo-sentinel-linux-arm64';
	return null;
}

async function githubFetch(url: string): Promise<Response> {
	const res = await fetch(url, {
		headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText} for ${url}`);
	return res;
}

/** Always this exact hardcoded repo's `/releases/latest` - never a URL built from anything else. */
export async function fetchLatestRelease(): Promise<LatestRelease> {
	const res = await githubFetch(API_URL);
	const body = (await res.json()) as any;
	return {
		version: String(body.tag_name ?? '').replace(/^v/, ''),
		htmlUrl: body.html_url,
		assets: (body.assets ?? []).map((a: any) => ({ name: a.name, downloadUrl: a.browser_download_url })),
	};
}

export function pickPlatformAsset(release: LatestRelease): PlatformAsset | null {
	const baseName = platformAssetBaseName();
	if (!baseName) return null;
	const zip = release.assets.find((a) => a.name === `${baseName}.zip`);
	const checksums = release.assets.find((a) => a.name === 'SHA256SUMS');
	if (!zip || !checksums) return null;
	return { zip, checksums };
}

/**
 * Pure check, no side effects beyond the one GitHub API call - never
 * downloads anything itself (`self-updater.ts` owns that, and only runs it
 * when this reports `updateAvailable`). Never throws - a GitHub outage or
 * rate limit must never affect trading, so any failure here just logs and
 * reports "no update available" for this cycle, same fire-and-forget spirit
 * as healthcheck.ts's pings.
 */
export async function checkForUpdate(currentVersion: string, log: Logger): Promise<UpdateCheckResult> {
	try {
		const release = await fetchLatestRelease();
		if (!release.version || compareVersions(release.version, currentVersion) <= 0) {
			return { updateAvailable: false, currentVersion, latestVersion: release.version || currentVersion };
		}
		const asset = pickPlatformAsset(release);
		if (!asset) {
			log({
				type: 'update_check_no_asset',
				currentVersion,
				latestVersion: release.version,
				platform: process.platform,
				arch: process.arch,
			});
			return { updateAvailable: false, currentVersion, latestVersion: release.version };
		}
		log({ type: 'update_available', currentVersion, latestVersion: release.version });
		return { updateAvailable: true, currentVersion, latestVersion: release.version, asset };
	} catch (e: any) {
		log({ type: 'error', source: 'update_check', message: e.message });
		return { updateAvailable: false, currentVersion, latestVersion: currentVersion };
	}
}
