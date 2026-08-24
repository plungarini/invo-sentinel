/**
 * `Promise.allSettled` semantics with a concurrency cap, preserving input
 * order in the result array regardless of completion order - used for
 * fetch-only work (e.g. per-portfolio Invo reads) where firing everything
 * fully unbounded would burst too many requests at once, but full
 * sequential `await`-in-a-loop wastes the whole cycle waiting on one
 * round trip at a time for work that has no ordering dependency.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;

	async function worker(): Promise<void> {
		while (next < items.length) {
			const i = next++;
			try {
				results[i] = { status: 'fulfilled', value: await fn(items[i], i) };
			} catch (reason) {
				results[i] = { status: 'rejected', reason };
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}
