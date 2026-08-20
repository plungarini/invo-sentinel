import "server-only";
import { InvoClient } from "@daemon/clients/invo-client.js";
import { getAppConfig } from "../daemon/paths.js";

let cached: InvoClient | null = null;

export async function getInvoClient(): Promise<InvoClient> {
	if (!cached) cached = new InvoClient((await getAppConfig()).invoRefreshToken);
	return cached;
}

/** Called after a settings save that touches `invoRefreshToken`, so the next call rebuilds the client instead of keeping the stale one. */
export function invalidateInvoClient(): void {
	cached = null;
}
