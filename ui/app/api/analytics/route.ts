import { NextResponse } from "next/server";
import { loadAnalytics } from "@/server/analytics/loadAnalytics";

export const dynamic = "force-dynamic";

export async function GET() {
	try {
		return NextResponse.json(await loadAnalytics());
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
