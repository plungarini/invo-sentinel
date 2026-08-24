"use client";

import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 10_000;

/**
 * Detects the UI's own Node process going down and coming back up - during a
 * self-update's file swap (auto-copy.ts's process.exit(42)/start.bat/start.sh)
 * or the settings page's "Save and restart" flow (restartRequested flag) -
 * and reloads the page once it's confirmed responsive again. Mounted once,
 * globally, so this covers a restart triggered from another tab or fired
 * unattended by auto-update, not just one initiated from the current page.
 * Without this, a tab left open across the restart either sits on stale JS
 * chunks (a React hydration error once it reconciles against the new
 * build's server output) or just shows the raw 502 from whatever's proxying
 * this dashboard, with no explanation and no recovery.
 */
export default function RestartWatcher() {
	const wasDown = useRef(false);

	useEffect(() => {
		const interval = setInterval(async () => {
			try {
				const res = await fetch("/api/status", { cache: "no-store" });
				if (res.ok) {
					if (wasDown.current) window.location.reload();
				} else {
					wasDown.current = true;
				}
			} catch {
				wasDown.current = true;
			}
		}, POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	}, []);

	return null;
}
