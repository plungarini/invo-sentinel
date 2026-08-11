import useSWR from "swr";
import { fetcher } from "@/lib/polling";
import type { AgentKeyStatus } from "@/server/hyperliquid/loadAgentKeyStatus";

const AGENT_KEY_STATUS_REFRESH_MS = 5 * 60_000;

export function useAgentKeyStatus(fallbackData?: AgentKeyStatus) {
	return useSWR<AgentKeyStatus>("/api/agent-key-status", fetcher, {
		refreshInterval: AGENT_KEY_STATUS_REFRESH_MS,
		fallbackData,
	});
}
