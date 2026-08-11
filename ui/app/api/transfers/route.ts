import { NextResponse } from "next/server";
import { loadTransfers } from "@/server/hyperliquid/loadTransfers";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(await loadTransfers());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
