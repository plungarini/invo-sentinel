import { NextResponse } from "next/server";
import { loadBalanceChange24h } from "@/server/hyperliquid/loadBalanceChange24h";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(await loadBalanceChange24h());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
