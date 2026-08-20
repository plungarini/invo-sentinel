import { inflateRawSync } from 'zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';

/**
 * Minimal ZIP reader (central directory + local file headers, STORED/
 * DEFLATE only) built on Node's own `zlib.inflateRawSync` - deliberately not
 * a dependency on `unzip`/`Expand-Archive`/`tar`, whose availability differs
 * across a bare Raspberry Pi OS Lite install, minimal Docker images, and
 * Windows versions. GitHub's own release zips (and the `zip -r` this
 * project's own CI produces) use only these two methods, so this is
 * sufficient without pulling in a real archive library.
 */
export function extractZip(zipPath: string, destDir: string): void {
	const buf = readFileSync(zipPath);

	// End Of Central Directory record: search from the end for its 4-byte
	// signature (0x06054b50) - the comment field after it is variable-length,
	// so this can't just be read at a fixed offset from the end.
	const EOCD_SIG = 0x06054b50;
	let eocdOffset = -1;
	for (let i = buf.length - 22; i >= 0; i--) {
		if (buf.readUInt32LE(i) === EOCD_SIG) {
			eocdOffset = i;
			break;
		}
	}
	if (eocdOffset < 0) throw new Error('Not a valid zip file (no end-of-central-directory record found)');

	const entryCount = buf.readUInt16LE(eocdOffset + 10);
	const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

	let offset = centralDirOffset;
	for (let i = 0; i < entryCount; i++) {
		const sig = buf.readUInt32LE(offset);
		if (sig !== 0x02014b50) throw new Error(`Corrupt zip: expected central directory entry at offset ${offset}`);

		const method = buf.readUInt16LE(offset + 10);
		const compressedSize = buf.readUInt32LE(offset + 20);
		const nameLen = buf.readUInt16LE(offset + 28);
		const extraLen = buf.readUInt16LE(offset + 30);
		const commentLen = buf.readUInt16LE(offset + 32);
		const localHeaderOffset = buf.readUInt32LE(offset + 42);
		const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

		extractEntry(buf, localHeaderOffset, method, compressedSize, name, destDir);

		offset += 46 + nameLen + extraLen + commentLen;
	}
}

function extractEntry(buf: Buffer, localHeaderOffset: number, method: number, compressedSize: number, name: string, destDir: string): void {
	// Directory entries (trailing slash, zero size) just need creating - a
	// zip can legally omit them entirely if every file path implies its own
	// parent dirs, which mkdirSync's recursive option below already handles.
	if (name.endsWith('/')) return;

	const sig = buf.readUInt32LE(localHeaderOffset);
	if (sig !== 0x04034b50) throw new Error(`Corrupt zip: expected local file header at offset ${localHeaderOffset}`);
	const nameLen = buf.readUInt16LE(localHeaderOffset + 26);
	const extraLen = buf.readUInt16LE(localHeaderOffset + 28);
	const dataStart = localHeaderOffset + 30 + nameLen + extraLen;
	const compressed = buf.subarray(dataStart, dataStart + compressedSize);

	let data: Buffer;
	if (method === 0) data = compressed;
	else if (method === 8) data = inflateRawSync(compressed);
	else throw new Error(`Unsupported zip compression method ${method} for entry "${name}"`);

	// Reject any entry path that would escape destDir (zip-slip) - a
	// malicious/corrupt archive must never be able to write outside the
	// staging directory this daemon controls.
	const resolvedDest = resolve(destDir);
	const targetPath = resolve(destDir, name);
	const rel = relative(resolvedDest, targetPath);
	if (rel.startsWith('..') || resolve(rel) === rel) throw new Error(`Refusing unsafe zip entry path: "${name}"`);

	mkdirSync(dirname(targetPath), { recursive: true });
	writeFileSync(targetPath, data);
}
