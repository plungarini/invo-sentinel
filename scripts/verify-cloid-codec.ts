import { decodeCloidToBaseShortId, decodeCloidLeverage } from '../src/services/cloid-codec.js';

const samples: [string, string, number][] = [
	['0x0200000a0100000300db2c38da98813f', 'FzAzh71xU9', 10],
	['0x0200000a0100000447ec9235d9a0ba4a', 'Mmop65osfq', 10],
	['0x0200000a01000005a80bdecb85c2c049', 'U6lBhlEl2e', 10],
	['0x0200000501000007e7fa1c11ab8ae51a', 'g5E4C5HnSH', 5],
	['0x02000005010000089f2f1598cbdd4681', 'jtPOh3SlCo', 5],
	['0x02000005010000090f41f4d82f40f8a3', 'mDtCmx54n2', 5],
	['0x020000050100000a60efb7eef9b19608', 'tFD8Fhuata', 5],
];

let allOk = true;
for (const [cloid, expectedId, expectedLev] of samples) {
	const id = decodeCloidToBaseShortId(cloid);
	const lev = decodeCloidLeverage(cloid);
	const ok = id === expectedId && lev === expectedLev;
	allOk = allOk && ok;
	console.log(cloid, '->', id, lev, ok ? 'OK' : `FAIL (expected ${expectedId} ${expectedLev})`);
}

console.log('non-cloid inputs:', decodeCloidToBaseShortId(undefined), decodeCloidToBaseShortId('garbage'), decodeCloidToBaseShortId('0x0123456789abcdef0123456789abcdef'));
console.log('ALL OK:', allOk);
if (!allOk) process.exit(1);
