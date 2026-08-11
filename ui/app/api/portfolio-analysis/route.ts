import { NextRequest, NextResponse } from "next/server";
import { loadPortfolioAnalysis } from "@/server/daemon/loadPortfolioAnalysis";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const portfolioId = new URL(request.url).searchParams.get("portfolioId");
	if (!portfolioId) return NextResponse.json({ error: "portfolioId is required" }, { status: 400 });
	try {
		return NextResponse.json(await loadPortfolioAnalysis(portfolioId));
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
