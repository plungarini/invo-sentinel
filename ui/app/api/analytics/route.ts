import { NextRequest, NextResponse } from "next/server";
import { loadAnalytics } from "@/server/analytics/loadAnalytics";
import type { AnalyticsPeriod } from "@/types/ui";

export const dynamic = "force-dynamic";

const VALID_PERIODS: AnalyticsPeriod[] = ["today", "wtd", "mtd", "ytd", "all"];

function parsePeriod(value: string | null): AnalyticsPeriod {
	return VALID_PERIODS.includes(value as AnalyticsPeriod) ? (value as AnalyticsPeriod) : "all";
}

export async function GET(request: NextRequest) {
	try {
		const period = parsePeriod(request.nextUrl.searchParams.get("period"));
		return NextResponse.json(await loadAnalytics(period));
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
