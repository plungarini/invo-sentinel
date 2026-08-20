import PageHeader from "@/components/shared/PageHeader";
import Card from "@/components/shared/Card";
import RequiredSecretsForm from "@/components/settings/RequiredSecretsForm";
import TuningSettingsForm from "@/components/settings/TuningSettingsForm";
import TraderModeSettingsForm from "@/components/settings/TraderModeSettingsForm";
import CredentialInstructions from "@/components/settings/CredentialInstructions";
import { getSettingsFormValues } from "@/server/daemon/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const { secrets, tuning, traderMode } = await getSettingsFormValues();

	return (
		<div className="flex h-full min-h-0 flex-col">
			<PageHeader title="Settings" />
			<div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-1 pb-24 pr-3 pt-14 md:pb-6 md:pt-0">
				<div className="flex flex-col gap-6">
					<Card title="Credentials">
						<RequiredSecretsForm
							maskedHints={{ invoRefreshToken: secrets.invoRefreshToken, hlAgentKey: secrets.hlAgentKey }}
							walletAddress={secrets.walletAddress}
						/>
						<div className="mt-6 flex flex-col gap-3 border-t border-border pt-5">
							<p className="text-[12px] font-semibold uppercase tracking-wide text-text-faint">Where to find these</p>
							<CredentialInstructions />
						</div>
					</Card>

					<Card title="Risk & tuning">
						{/* Keyed on content for the same reason as the Trader mode form
						below - the stale-entry guardrail toggles here are controlled
						checkboxes too, subject to the same React 19 form auto-reset
						desync. */}
						<TuningSettingsForm key={JSON.stringify(tuning)} defaultValues={tuning} />
					</Card>

					<Card title="Trader mode">
						{/* Keyed on content, not just present for React's sake: React 19's
						<form action={...}> auto-resets its fields (including controlled
						checkboxes' real DOM `checked`) after every action call, success or
						failure, without re-rendering - silently desyncing the toggle's visual
						state from its React state. Forcing a remount right after a genuine
						save (traderMode's content actually changed) discards that stale DOM
						state and re-seeds the form from the freshly-persisted values instead;
						an unrelated page re-render (e.g. saving the Tuning form) leaves this
						key untouched, so in-progress edits here aren't lost either. */}
						<TraderModeSettingsForm key={JSON.stringify(traderMode)} defaultValues={traderMode} />
					</Card>
				</div>
			</div>
		</div>
	);
}
