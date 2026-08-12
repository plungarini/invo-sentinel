"use client";

import { useEffect, useSyncExternalStore } from "react";

export type PositionSortKey = "pnl" | "updatedAt" | "liqRisk" | "allocation" | "symbol";
export type SortDirection = "desc" | "asc";

export interface PositionSortState {
	key: PositionSortKey | null;
	direction: SortDirection;
}

const STORAGE_KEY = "sentinel:wallet-open-sort";
const DEFAULT_SORT: PositionSortState = { key: null, direction: "desc" };

function isValidSort(value: unknown): value is PositionSortState {
	if (typeof value !== "object" || value === null) return false;
	const v = value as Record<string, unknown>;
	const keyOk =
		v.key === null ||
		v.key === "pnl" ||
		v.key === "updatedAt" ||
		v.key === "liqRisk" ||
		v.key === "allocation" ||
		v.key === "symbol";
	const directionOk = v.direction === "desc" || v.direction === "asc";
	return keyOk && directionOk;
}

// Module-level singleton, not per-component state - the Wallet page mounts a
// separate mobile and desktop layout at the same time (only one visible via
// CSS at a given viewport), so per-instance useState let them silently
// diverge: each read localStorage once on its own mount and never learned
// about a change made through the other's chip, so the visible chip's label
// and the visible list's actual order could disagree (confirmed live).
let sortState: PositionSortState = DEFAULT_SORT;
const listeners = new Set<() => void>();

function setSort(next: PositionSortState) {
	sortState = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// storage unavailable (private mode, quota) - in-memory state still works for this session
	}
	listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot() {
	return sortState;
}

function getServerSnapshot() {
	return DEFAULT_SORT;
}

let hydrated = false;

/**
 * Persists the Open-tab sort choice across reloads, shared by every mounted
 * consumer via a module-level store rather than per-component state (see
 * above). SSR-safe: the server snapshot is always the default, and
 * localStorage is read once, lazily, inside an effect - whichever consumer
 * mounts first does the read and broadcasts it to every other subscriber.
 */
export function usePositionSort() {
	const sort = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	useEffect(() => {
		if (hydrated) return;
		hydrated = true;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw);
			if (isValidSort(parsed)) {
				sortState = parsed;
				listeners.forEach((listener) => listener());
			}
		} catch {
			// corrupt or unavailable storage - fall back to the default silently
		}
	}, []);

	return [sort, setSort] as const;
}
