import { NextRequest, NextResponse } from "next/server";
import { loadHistory, enrichHistoryPage } from "@/server/history/loadHistory";
import { computeTotalFeesUsd } from "@/server/analytics/aggregateAnalytics";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	try {
		const { trades } = await loadHistory();
		const { searchParams } = new URL(request.url);

		// Cheap total - no live HL position fetch, unlike /api/analytics. Shared
		// by both Overview's and Wallet's Total Balance banner.
		if (searchParams.get("feesOnly") === "1") {
			return NextResponse.json({ totalFeesUsd: computeTotalFeesUsd(trades) });
		}

		// Single-trade lookup - the modal's deep-link (?trade=) can point at a
		// trade beyond whatever page the History tab has paginated to so far.
		const baseId = searchParams.get("baseId");
		if (baseId) {
			const trade = trades.find((t) => t.baseId === baseId) ?? null;
			return NextResponse.json({ trade });
		}

		// The History tab shows closed trades only - open positions already have
		// their own dedicated view (Wallet > Open).
		const closedTrades = trades.filter((t) => t.status === "closed");

		const limitParam = searchParams.get("limit");
		if (limitParam) {
			const limit = Math.max(1, parseInt(limitParam, 10) || 20);
			const cursor = Math.max(0, parseInt(searchParams.get("cursor") ?? "0", 10) || 0);
			const page = await enrichHistoryPage(closedTrades.slice(cursor, cursor + limit));
			const nextCursor = cursor + limit < closedTrades.length ? cursor + limit : null;
			return NextResponse.json({ trades: page, nextCursor, total: closedTrades.length });
		}

		// No pagination params - the full list, e.g. for Analytics' aggregation
		// which genuinely needs every trade to compute totals/averages.
		return NextResponse.json({ trades });
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
