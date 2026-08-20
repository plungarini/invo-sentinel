"use client";

import { useActionState } from "react";
import Button from "@/components/shared/Button";
import { saveTuningSettings, type ActionState } from "@/app/settings/actions";
import type { TuningFormValues } from "@/server/daemon/settings";
import Field from "./Field";

const INITIAL_STATE: ActionState = { ok: false };

function SectionLabel({ children }: { children: React.ReactNode }) {
	return <p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">{children}</p>;
}

export default function TuningSettingsForm({ defaultValues }: { defaultValues: TuningFormValues }) {
	const [state, formAction, pending] = useActionState(saveTuningSettings, INITIAL_STATE);

	return (
		<form action={formAction} className="flex flex-col gap-6">
			<div className="flex flex-col gap-3">
				<SectionLabel>Risk band</SectionLabel>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						label="Min margin %"
						name="minMarginPct"
						defaultValue={defaultValues.minMarginPct}
						hint="Never risk less than this % of your equity per trade."
					/>
					<Field
						label="Max margin %"
						name="maxMarginPct"
						defaultValue={defaultValues.maxMarginPct}
						hint="Never risk more than this %, no matter what the trader did."
					/>
					<Field
						label="Max leverage"
						name="maxLeverage"
						defaultValue={defaultValues.maxLeverage}
						placeholder="blank = no cap"
						hint="Leverage is capped here, not rejected."
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				<SectionLabel>Stale entries</SectionLabel>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field
						label="Max age (minutes)"
						name="staleEntryMaxAgeMinutes"
						defaultValue={defaultValues.staleEntryMaxAgeMinutes}
						hint="Past this age, a fresh entry is permanently skipped instead of opened."
					/>
					<Field
						label="Max profit %"
						name="staleEntryMaxProfitPct"
						defaultValue={defaultValues.staleEntryMaxProfitPct}
						hint="Still within the age window but already up this much % is skipped for one cycle."
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				<SectionLabel>Operations</SectionLabel>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Poll interval (ms)" name="pollIntervalMs" defaultValue={defaultValues.pollIntervalMs} />
					<Field label="Log retention (hours)" name="logRetentionHours" defaultValue={defaultValues.logRetentionHours} />
					<Field label="Log max total size (MB)" name="logMaxTotalMb" defaultValue={defaultValues.logMaxTotalMb} />
					<Field
						label="Healthcheck ping URL"
						name="healthcheckPingUrl"
						defaultValue={defaultValues.healthcheckPingUrl}
						placeholder="optional, e.g. healthchecks.io"
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 border-t border-border pt-5">
				{state.error && <p className="text-[13px] text-loss">{state.error}</p>}
				{state.ok && (
					<p className="text-[13px] text-profit">
						Saved. Takes effect on the next reconcile cycle - a margin band change resizes open positions with real
						orders on the exchange, not just new trades.
					</p>
				)}
				<Button type="submit" variant="primary" disabled={pending} className="self-start">
					{pending ? "Saving..." : "Save settings"}
				</Button>
			</div>
		</form>
	);
}
