import { NextResponse } from "next/server";
import { loadAgentKeyStatus } from "@/server/hyperliquid/loadAgentKeyStatus";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(await loadAgentKeyStatus());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
