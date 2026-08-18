import { loadConfig } from '../src/config/env.js';
import { InvoClient } from '../src/clients/invo-client.js';
import { HyperliquidClient } from '../src/clients/hyperliquid-client.js';
import { resolveConflictByCloid, discoverCloidAttributedCoins } from '../src/core/cloid-attribution.js';
import type { OpenInvestment, PositionStateMap, CloidAttributionCache } from '../src/types.js';

async function main() {
	const config = loadConfig();
	const invo = new InvoClient(config.invoRefreshToken);
	const hl = new HyperliquidClient(config.hlAgentKey, config.walletAddress);
	await hl.connect();

	console.log('--- Test 1: resolveConflictByCloid against STX real rival data (limpan96 vs youssef) ---');
	const limpanInv = await invo.getOpenInvestments('0e123c39-1b77-4163-867e-f6e153da4946');
	const youssefInv = await invo.getOpenInvestments('cf413b83-11a0-488f-87b9-825dded61c36');
	const stxLimpan = limpanInv.find((i) => i.ticker.toUpperCase() === 'STX');
	const stxYoussef = youssefInv.find((i) => i.ticker.toUpperCase() === 'STX');
	if (!stxLimpan || !stxYoussef) {
		console.log('SKIP: STX rival candidates no longer both open - cannot replay this exact scenario');
	} else {
		const fills = await hl.getUserFills();
		const candidates: OpenInvestment[] = [stxLimpan, stxYoussef];
		const resolvedBaseId = resolveConflictByCloid(fills, 'STX', candidates);
		const ok = resolvedBaseId === stxLimpan.baseId;
		console.log('resolved baseId:', resolvedBaseId, 'expected (limpan96):', stxLimpan.baseId, ok ? 'OK' : 'FAIL');
		if (!ok) process.exitCode = 1;
	}

	console.log('\n--- Test 2: discoverCloidAttributedCoins against a simulated freshly-untracked coin ---');
	const realPositions = await hl.getPositions();
	const stxPosition = realPositions.find((p) => p.coin === 'STX');
	if (!stxPosition) {
		console.log('SKIP: no live STX position to simulate against');
	} else {
		// Simulate STX being untracked by omitting it from a fake state map -
		// does NOT touch the real .copy-state.json or .copy-cloid-cache.json.
		const fakeState: PositionStateMap = {};
		const fakeCache: CloidAttributionCache = {};
		const { resolved } = await discoverCloidAttributedCoins(hl, invo, [stxPosition], fakeState, fakeCache, () => {});
		const attribution = resolved.get('STX');
		const ok = !!attribution && attribution.trader != null && attribution.investmentBaseId != null;
		console.log('resolved attribution for simulated-untracked STX:', attribution, ok ? 'OK' : 'FAIL');
		if (!ok) process.exitCode = 1;

		console.log('\n--- Test 3: cache hit on second call (no extra API calls needed) ---');
		let hlCallCount = 0;
		const countingHl = new Proxy(hl, {
			get(target, prop, receiver) {
				const orig = Reflect.get(target, prop, receiver);
				if (prop === 'getUserFills' && typeof orig === 'function') {
					return (...args: unknown[]) => {
						hlCallCount++;
						return orig.apply(target, args);
					};
				}
				return orig;
			},
		});
		const cacheAfterFirstRun: CloidAttributionCache = { ...fakeCache };
		await discoverCloidAttributedCoins(countingHl as HyperliquidClient, invo, [stxPosition], fakeState, cacheAfterFirstRun, () => {});
		const ok2 = hlCallCount === 0;
		console.log('getUserFills calls on cached second run:', hlCallCount, ok2 ? 'OK (no re-fetch)' : 'FAIL (should be 0)');
		if (!ok2) process.exitCode = 1;
	}

	console.log('\n--- Test 4: a genuinely non-Invo coin should resolve to nothing (manual, not adopted) ---');
	// BTC/ETH/etc are user's own direct trades in this account, not Invo mimics - verify at least one currently-tracked-elsewhere coin, if simulated as untracked, comes back unresolved.
	const btcPosition = realPositions.find((p) => p.coin === 'BTC');
	if (btcPosition) {
		const fakeState2: PositionStateMap = {};
		const fakeCache2: CloidAttributionCache = {};
		const { resolved: resolved2, cacheChanged } = await discoverCloidAttributedCoins(hl, invo, [btcPosition], fakeState2, fakeCache2, (e) => console.log('  [log]', JSON.stringify(e)));
		console.log('cacheChanged:', cacheChanged, 'fakeCache2 keys:', Object.keys(fakeCache2));
		const cached = fakeCache2['BTC'];
		const ok3 = !resolved2.has('BTC') && cached?.kind === 'manual';
		console.log('BTC (real, non-mimic trade) resolved as manual:', cached, ok3 ? 'OK' : 'FAIL');
		if (!ok3) process.exitCode = 1;
	} else {
		console.log('SKIP: no live BTC position to test against');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
