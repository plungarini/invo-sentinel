import { NextRequest, NextResponse } from "next/server";
import { loadHistory, enrichHistoryPage } from "@/server/history/loadHistory";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	try {
		const { trades } = await loadHistory();
		const { searchParams } = new URL(request.url);

		// Cheap total that doesn't require shipping every trade's full lifecycle
		// to the client just to show a running fee figure next to the balance.
		if (searchParams.get("feesOnly") === "1") {
			const totalFeesUsd = trades.reduce((sum, t) => sum + (t.feesUsd ?? 0), 0);
			return NextResponse.json({ totalFeesUsd });
		}

		// Single-trade lookup - the modal's deep-link (?trade=) can point at a
		// trade beyond whatever page the History tab has paginated to so far.
		const baseId = searchParams.get("baseId");
		if (baseId) {
			const trade = trades.find((t) => t.baseId === baseId) ?? null;
			return NextResponse.json({ trade });
		}

		const limitParam = searchParams.get("limit");
		if (limitParam) {
			const limit = Math.max(1, parseInt(limitParam, 10) || 20);
			const cursor = Math.max(0, parseInt(searchParams.get("cursor") ?? "0", 10) || 0);
			const page = await enrichHistoryPage(trades.slice(cursor, cursor + limit));
			const nextCursor = cursor + limit < trades.length ? cursor + limit : null;
			return NextResponse.json({ trades: page, nextCursor, total: trades.length });
		}

		// No pagination params - the full list, e.g. for Analytics' aggregation
		// which genuinely needs every trade to compute totals/averages.
		return NextResponse.json({ trades });
	} catch (e) {
		return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
	}
}
