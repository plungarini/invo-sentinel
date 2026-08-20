import PageHeader from "@/components/shared/PageHeader";
import Card from "@/components/shared/Card";
import RequiredSecretsForm from "@/components/settings/RequiredSecretsForm";
import TuningSettingsForm from "@/components/settings/TuningSettingsForm";
import CredentialInstructions from "@/components/settings/CredentialInstructions";
import { getSettingsFormValues } from "@/server/daemon/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
	const { secrets, tuning } = await getSettingsFormValues();

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
						<TuningSettingsForm defaultValues={tuning} />
					</Card>
				</div>
			</div>
		</div>
	);
}
