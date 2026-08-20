import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Logger } from './logger.js';
import type { PlatformAsset } from './update-checker.js';
import { extractZip } from './zip-extract.js';

export interface PendingUpdateMarker {
	version: string;
	stagedAt: string;
}

/**
 * Everything auto-update writes lives under `<bin>/.update/` - `bin/` is
 * already "internal, don't touch" by convention (that's where the binary
 * and `data/`/`logs/` live too - see CLAUDE.md's packaging section), so this
 * fits the same convention rather than adding a new top-level surprise.
 */
function updateDir(rootDir: string): string {
	return join(rootDir, '.update');
}

export function pendingMarkerPath(rootDir: string): string {
	return join(updateDir(rootDir), 'pending.json');
}

/** Plain version string, sibling to `pending.json` - `start.bat`/`start.sh` read this one instead of parsing JSON in batch/bash. */
export function pendingVersionPath(rootDir: string): string {
	return join(updateDir(rootDir), 'pending-version.txt');
}

export function rollbackBlockedPath(rootDir: string, version: string): string {
	return join(updateDir(rootDir), `rollback-blocked-${version}.json`);
}

/** A version the wrapper script already tried once and had to roll back from (crash-looped) - never auto-retried; the user has to delete the marker file to try again, which is a deliberate manual gate on retrying a build already proven bad on this machine. */
export function isVersionRollbackBlocked(rootDir: string, version: string): boolean {
	return existsSync(rollbackBlockedPath(rootDir, version));
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
	const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
	if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText} for ${url}`);
	const buf = Buffer.from(await res.arrayBuffer());
	writeFileSync(destPath, buf);
}

async function fetchChecksums(url: string): Promise<Map<string, string>> {
	const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
	if (!res.ok) throw new Error(`Checksum fetch failed: ${res.status} ${res.statusText} for ${url}`);
	const text = await res.text();
	// Standard `sha256sum` output: "<hex>  <filename>" per line.
	const map = new Map<string, string>();
	for (const line of text.split('\n')) {
		const match = line.trim().match(/^([a-f0-9]{64})\s+\**(.+)$/i);
		if (match) map.set(match[2].trim(), match[1].toLowerCase());
	}
	return map;
}

function sha256File(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Downloads the platform zip + published SHA256SUMS, verifies the zip's
 * hash matches before trusting it at all, extracts to a staging directory,
 * and writes the pending-update marker the wrapper script (`start.bat`/
 * `start.sh`) acts on once this process exits cleanly. Never touches the
 * live `bin/<exe>`, `ui/`, or `node_modules/` itself - the actual swap only
 * happens with the daemon fully exited, so there's no self-file-lock hazard
 * on any OS. Returns false (and leaves no pending marker) on any failure -
 * a partial/corrupt stage must never be picked up by the wrapper script.
 */
export async function performUpdate(opts: { rootDir: string; asset: PlatformAsset; latestVersion: string; log: Logger }): Promise<boolean> {
	const { rootDir, asset, latestVersion, log } = opts;
	const dir = updateDir(rootDir);
	const stagingDir = join(dir, 'staging');
	const zipPath = join(dir, 'download.zip');

	try {
		mkdirSync(dir, { recursive: true });
		rmSync(stagingDir, { recursive: true, force: true });

		log({ type: 'update_downloading', version: latestVersion, asset: asset.zip.name });
		const checksums = await fetchChecksums(asset.checksums.downloadUrl);
		const expectedHash = checksums.get(asset.zip.name);
		if (!expectedHash) throw new Error(`SHA256SUMS has no entry for ${asset.zip.name}`);

		await downloadToFile(asset.zip.downloadUrl, zipPath);

		const actualHash = sha256File(zipPath);
		if (actualHash !== expectedHash) {
			throw new Error(`Checksum mismatch for ${asset.zip.name}: expected ${expectedHash}, got ${actualHash}`);
		}
		log({ type: 'update_verified', version: latestVersion, sha256: actualHash });

		mkdirSync(stagingDir, { recursive: true });
		extractZip(zipPath, stagingDir);

		const marker: PendingUpdateMarker = { version: latestVersion, stagedAt: new Date().toISOString() };
		writeFileSync(pendingMarkerPath(rootDir), JSON.stringify(marker, null, 2));
		writeFileSync(pendingVersionPath(rootDir), latestVersion);
		log({ type: 'update_staged', version: latestVersion });
		return true;
	} catch (e: any) {
		log({ type: 'error', source: 'self_updater', message: e.message, version: latestVersion });
		rmSync(stagingDir, { recursive: true, force: true });
		return false;
	} finally {
		rmSync(zipPath, { force: true });
	}
}
