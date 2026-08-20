"use client";

import { useEffect, useRef } from "react";

export interface AutoSaveOptions {
	/** Quiet period after the last change/blur before actually submitting. */
	debounceMs?: number;
	/** Master off-switch, e.g. while the wizard's own required-field gating applies. */
	enabled?: boolean;
	/** Mirror of `useActionState`'s own `pending` - a change while a save is already in flight queues one retry instead of overlapping it. */
	pending?: boolean;
	/** Extra gate beyond "did anything change" - e.g. RequiredSecretsForm's "at least one field must actually be typed" rule, so tabbing through untouched fields never fires a save. */
	canSave?: (formData: FormData) => boolean;
}

function serialize(formData: FormData): string {
	const entries: [string, string][] = [];
	for (const [key, value] of formData.entries()) entries.push([key, String(value)]);
	entries.sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(entries);
}

/**
 * Wires a `<form>` up for autosave-on-change/blur instead of requiring an
 * explicit submit click - attach the returned `onChange`/`onBlur` to the
 * form element itself (both bubble up from every descendant input via
 * React's synthetic events, so no per-field wiring is needed).
 *
 * Guards against the usual autosave failure modes:
 *  - one shared debounce for both triggers, so typing-then-tabbing-away
 *    collapses into a single submit instead of one per keystroke/blur:
 *  - a read one tick after the triggering event, not synchronously inside
 *    it, so a same-event controlled DOM update (e.g. SecretField's
 *    decoupled hidden input) has actually committed before `FormData` is
 *    read - otherwise a masked/secret field's freshly-typed value could be
 *    read one keystroke stale.
 *  - skips entirely if the serialized form is identical to the last
 *    attempt, so blurring in and out of an untouched field is a no-op, not
 *    a redundant save (and not a redundant live credentials check, for the
 *    Credentials form specifically).
 *  - a change while a save is already in flight queues a single retry
 *    instead of firing a second overlapping submit.
 */
export function useAutoSaveForm(formRef: React.RefObject<HTMLFormElement | null>, opts: AutoSaveOptions = {}) {
	const { debounceMs = 600, enabled = true, pending = false, canSave } = opts;

	const lastAttemptedRef = useRef<string | null>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const queuedRef = useRef(false);
	const pendingRef = useRef(pending);

	// Baseline signature is today's already-committed values, not "nothing
	// yet" - otherwise the very first blur after mount (with no real edit)
	// would look "changed" relative to an empty baseline and fire a no-op save.
	useEffect(() => {
		const form = formRef.current;
		if (form) lastAttemptedRef.current = serialize(new FormData(form));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		pendingRef.current = pending;
		if (!pending && queuedRef.current) {
			queuedRef.current = false;
			attempt();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pending]);

	useEffect(() => () => {
		if (timerRef.current) clearTimeout(timerRef.current);
	}, []);

	function attempt() {
		const form = formRef.current;
		if (!form || !enabled) return;
		const formData = new FormData(form);
		const signature = serialize(formData);
		if (signature === lastAttemptedRef.current) return;
		if (canSave && !canSave(formData)) return;
		if (pendingRef.current) {
			queuedRef.current = true;
			return;
		}
		lastAttemptedRef.current = signature;
		form.requestSubmit();
	}

	function schedule() {
		if (!enabled) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(attempt, debounceMs);
	}

	return {
		onChange: schedule,
		onBlur: schedule,
	};
}
