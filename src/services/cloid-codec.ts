const CLOID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62Encode(n: bigint): string {
	// BigInt(0) not `0n` - the UI's Next.js build type-checks this file too
	// (see ui/tsconfig.json's `@daemon/*` path) at an ES2017 target, which
	// rejects BigInt literal syntax outright even though BigInt itself works
	// fine at runtime there.
	if (n === BigInt(0)) return CLOID_ALPHABET[0];
	let s = '';
	const base = BigInt(CLOID_ALPHABET.length);
	while (n > BigInt(0)) {
		s = CLOID_ALPHABET[Number(n % base)] + s;
		n /= base;
	}
	return s;
}

/**
 * Invo's client-order-id layout for its own mimic-placed orders (reverse
 * engineered 2026-08-13 from real fills, confirmed exact on 7 samples across
 * 2 traders/2 leverages): 16 bytes - 0x02 constant, action marker, 0x00,
 * leverage, 0x01, 0x00, 0x00, then baseShortId base62-decoded as a
 * big-endian uint64 (bytes 7-14), then a per-order suffix byte. This
 * daemon's own orders never set cloid at all, so a value that decodes
 * cleanly here was necessarily placed through Invo's own mimic flow -
 * a free, deterministic discriminator between "real mimic" and "unrelated
 * manual trade", replacing every prior heuristic (isMimicked/unmimickedCount,
 * TP/SL cross-reference, notification timing) with an exact one.
 */
export function decodeCloidToBaseShortId(cloid: string | null | undefined): string | null {
	if (!cloid) return null;
	const hex = cloid.startsWith('0x') ? cloid.slice(2) : cloid;
	if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) return null;

	const bytes: number[] = [];
	for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));

	if (bytes[0] !== 0x02 || bytes[2] !== 0x00 || bytes[4] !== 0x01 || bytes[5] !== 0x00 || bytes[6] !== 0x00) return null;

	const idFieldHex = hex.slice(14, 30); // bytes[7..14], 8 bytes
	const baseShortId = base62Encode(BigInt('0x' + idFieldHex));
	// Every real Invo baseShortId observed (and its own /dex/trade schema) is
	// exactly 10 characters - a shorter decode means either a numerically-small
	// value with no real baseShortId behind it, or a cloid this layout doesn't
	// actually apply to; never send something Invo's own schema would reject.
	return baseShortId.length === 10 ? baseShortId : null;
}

/** Leverage encoded at byte[3] - free cross-check against the resolved investment's own leverage; a mismatch means something is off, not a fatal error. */
export function decodeCloidLeverage(cloid: string | null | undefined): number | null {
	if (!cloid) return null;
	const hex = cloid.startsWith('0x') ? cloid.slice(2) : cloid;
	if (hex.length !== 32 || !/^[0-9a-fA-F]{32}$/.test(hex)) return null;
	if (parseInt(hex.slice(0, 2), 16) !== 0x02) return null;
	return parseInt(hex.slice(6, 8), 16);
}
