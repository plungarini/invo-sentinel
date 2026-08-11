import { NextResponse } from "next/server";
import { loadWallet } from "@/server/hyperliquid/loadWallet";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(await loadWallet());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
