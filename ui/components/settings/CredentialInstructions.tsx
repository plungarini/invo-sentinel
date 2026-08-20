const REFRESH_TOKEN_SNIPPET = `const aesKeyB64 = localStorage.getItem('FlutterSecureStorage');
const encryptedRefresh = localStorage.getItem('FlutterSecureStorage.REFRESH_TOKEN');
const [ivB64, ctB64] = encryptedRefresh.split('.');
const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
const ct = Uint8Array.from(atob(ctB64), (c) => c.charCodeAt(0));
const keyBytes = Uint8Array.from(atob(aesKeyB64), (c) => c.charCodeAt(0));
const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct);
console.log(new TextDecoder().decode(decrypted)); // 3 dot-separated parts; that's your token`;

export interface CredentialStep {
	key: "invoRefreshToken" | "hlAgentKey" | "walletAddress";
	label: string;
	inputType: "textarea" | "input";
	placeholder: string;
	/** Where to find this one value - same extraction steps as the README's Credentials section, kept as the single source both the step-by-step wizard and the Settings page's reference read from. */
	instructions: React.ReactNode;
}

/** Same 3 extraction steps as the README's Credentials section, one per required value. */
export const CREDENTIAL_STEPS: CredentialStep[] = [
	{
		key: "invoRefreshToken",
		label: "Invo refresh token",
		inputType: "textarea",
		placeholder: "eyJ...",
		instructions: (
			<>
				<p className="text-text-muted">
					Log into <span className="font-mono">app.invoapp.com</span> in Chrome, open DevTools console, and run:
				</p>
				<pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[12px] text-text-muted">{REFRESH_TOKEN_SNIPPET}</pre>
			</>
		),
	},
	{
		key: "hlAgentKey",
		label: "Hyperliquid agent key",
		inputType: "input",
		placeholder: "0x...",
		instructions: (
			<p className="text-text-muted">
				DevTools → Application → IndexedDB → <span className="font-mono">invo_hl_agents</span> →{" "}
				<span className="font-mono">agents</span> → <span className="font-mono">current</span> →{" "}
				<span className="font-mono">privateKey</span>.
			</p>
		),
	},
	{
		key: "walletAddress",
		label: "Wallet address",
		inputType: "input",
		placeholder: "0x...",
		instructions: (
			<p className="text-text-muted">
				DevTools → Application → Local Storage → value of <span className="font-mono">flutter.hl.masterAddress</span>.
			</p>
		),
	},
];

/**
 * Settings page's always-visible reference for all 3 at once, collapsed by
 * default, unlike the wizard's one-at-a-time flow - same bordered panel
 * styling as the wizard's per-step instructions box, so the two views read
 * as one coherent pattern rather than two different designs.
 */
export default function CredentialInstructions() {
	return (
		<div className="flex flex-col gap-2">
			{CREDENTIAL_STEPS.map((step) => (
				<details key={step.key} className="rounded-xl border border-border bg-surface-hover px-4 py-3 text-[13px]">
					<summary className="cursor-pointer font-semibold text-text">Where to find the {step.label.toLowerCase()}</summary>
					<div className="mt-2 leading-relaxed">{step.instructions}</div>
				</details>
			))}
		</div>
	);
}
