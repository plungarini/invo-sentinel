import { NextResponse } from "next/server";
import { loadStatus } from "@/server/daemon/loadStatus";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(loadStatus());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
