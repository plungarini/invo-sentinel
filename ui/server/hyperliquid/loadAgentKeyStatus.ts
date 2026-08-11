import "server-only";
import { getHyperliquidClient } from "./client";
import { staleWhileRevalidate } from "../staleWhileRevalidate";

const CACHE_TTL_MS = 5 * 60_000; // agent approval state changes rarely - no need to poll HL tightly for this

export interface AgentKeyStatus {
	/** Days until the soonest-expiring approved agent lapses, or null if none has an expiration at all. */
	daysRemaining: number | null;
	/** True once at least one agent was found under this account, regardless of whether it expires. */
	hasAgents: boolean;
}

async function fetchAgentKeyStatus(): Promise<AgentKeyStatus> {
	const hl = await getHyperliquidClient();
	const agents = await hl.getExtraAgents();
	const expiring = agents.filter((a) => typeof a.validUntil === "number").map((a) => a.validUntil as number);
	if (expiring.length === 0) return { daysRemaining: null, hasAgents: agents.length > 0 };
	const soonestMs = Math.min(...expiring);
	return { daysRemaining: (soonestMs - Date.now()) / 86_400_000, hasAgents: true };
}

/** Shared by /api/agent-key-status and the Overview page's server-side initial fetch. */
export const loadAgentKeyStatus = staleWhileRevalidate(fetchAgentKeyStatus, CACHE_TTL_MS);
