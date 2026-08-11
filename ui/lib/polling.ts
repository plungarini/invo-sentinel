export const STATUS_REFRESH_MS = 4000;
export const HISTORY_REFRESH_MS = 30000;
export const ANALYTICS_REFRESH_MS = 60000;
export const TRANSFERS_REFRESH_MS = 60000;

export async function fetcher<T = unknown>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url} responded ${res.status}`);
	return res.json();
}
