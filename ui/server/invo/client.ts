import "server-only";
import { InvoClient } from "@daemon/clients/invo-client.js";
import { getAppConfig } from "../daemon/paths.js";

let cached: InvoClient | null = null;

export function getInvoClient(): InvoClient {
	if (!cached) cached = new InvoClient(getAppConfig().invoRefreshToken);
	return cached;
}
