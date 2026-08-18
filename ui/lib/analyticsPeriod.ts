import type { AnalyticsPeriod } from "@/types/ui";

/** Shared by the SSR page's initial fetch, the client's initial period state, and useAnalytics's fallback-data key, so all three agree on what "no selection yet" means. */
export const DEFAULT_ANALYTICS_PERIOD: AnalyticsPeriod = "wtd";

function startOfDay(d: Date): Date {
	const s = new Date(d);
	s.setHours(0, 0, 0, 0);
	return s;
}

function startOfWeek(d: Date): Date {
	const s = startOfDay(d);
	const daysSinceMonday = (s.getDay() + 6) % 7; // getDay(): 0=Sun..6=Sat -> days since Monday
	s.setDate(s.getDate() - daysSinceMonday);
	return s;
}

function startOfMonth(d: Date): Date {
	const s = startOfDay(d);
	s.setDate(1);
	return s;
}

function startOfYear(d: Date): Date {
	const s = startOfDay(d);
	s.setMonth(0, 1);
	return s;
}

/** null means "no lower bound" (the "all" period). Pure, no I/O - shared by server-side trade filtering and client-side transfer-marker filtering so both agree on period boundaries. */
export function periodStart(period: AnalyticsPeriod, now: Date): Date | null {
	switch (period) {
		case "today":
			return startOfDay(now);
		case "wtd":
			return startOfWeek(now);
		case "mtd":
			return startOfMonth(now);
		case "ytd":
			return startOfYear(now);
		case "all":
			return null;
	}
}
