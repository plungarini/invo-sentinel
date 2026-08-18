import type { HyperliquidLedgerUpdate } from "@daemon/types.js";
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { formatUsd, timeAgo } from "@/lib/format";

const INCOMING_TYPES = new Set(["deposit", "receive", "rewardsClaim"]);
const OUTGOING_TYPES = new Set(["withdraw", "send"]);

// Unambiguous regardless of sign - these HL types only ever mean one direction.
const FIXED_LABEL_BY_TYPE: Record<string, string> = {
	deposit: "Deposit",
	withdraw: "Withdrawal",
	rewardsClaim: "Rewards claim",
	vaultDeposit: "Vault deposit",
	vaultWithdraw: "Vault withdrawal",
};

// Hyperliquid's ledger API carries no chain/network field. A non-native-chain
// deposit (e.g. Solana) never shows up as `type: "deposit"` at all - it gets
// routed through a fixed relayer address and lands as an ordinary internal
// `send`/`receive`, structurally identical to a genuine peer-to-peer transfer
// except for the sender address. Hardcoded from one confirmed sample
// (2026-08-17, Invo's Solana deposit path) - unofficial API, no docs for this,
// so if Invo/HL ever rotates the relayer, entries routed through the new
// address just read as "Received" again until this map is updated.
const KNOWN_DEPOSIT_RELAYERS: Record<string, string> = {
	"0x6b9e773128f453f5c2c60935ee2de2cbc5390a24": "Solana",
};

// Everything else (send/receive/internalTransfer/accountClassTransfer/...) describes
// a transfer whose direction is only knowable from the real signed value, so the
// label follows that sign rather than the static type name.
function labelFor(type: string, isIncoming: boolean, isOutgoing: boolean, senderAddress?: string): string {
	if (FIXED_LABEL_BY_TYPE[type]) return FIXED_LABEL_BY_TYPE[type];
	const relayerNetwork = isIncoming && senderAddress ? KNOWN_DEPOSIT_RELAYERS[senderAddress.toLowerCase()] : undefined;
	if (relayerNetwork) return `Deposit (${relayerNetwork})`;
	if (isIncoming) return "Received";
	if (isOutgoing) return "Sent";
	return type;
}

export default function TransfersList({ transfers }: { transfers: HyperliquidLedgerUpdate[] }) {
	if (transfers.length === 0) {
		return (
			<p className="px-1 py-8 text-center text-[14px] text-text-muted">
				No deposits, withdrawals, or transfers found.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2.5">
			{transfers.map((t) => {
				const type = t.delta.type;
				const amount = t.delta.usdcValue ?? t.delta.amount ?? t.delta.usdc;
				const parsedAmount = amount != null ? parseFloat(amount) : null;

				// Sign of the actual value is ground truth for direction - the
				// static type lookup below is for icon/label only, since not every
				// real ledger `type` (e.g. accountClassTransfer) is in those sets.
				const isIncoming = parsedAmount != null ? parsedAmount > 0 : INCOMING_TYPES.has(type);
				const isOutgoing = parsedAmount != null ? parsedAmount < 0 : OUTGOING_TYPES.has(type);
				const Icon = isIncoming ? ArrowDownLeft : isOutgoing ? ArrowUpRight : ArrowLeftRight;
				const tone = isIncoming
					? "bg-profit/15 text-profit"
					: isOutgoing
						? "bg-loss/15 text-loss"
						: "bg-surface-hover text-text-muted";
				const amountClass = isIncoming ? "text-profit" : isOutgoing ? "text-loss" : "text-text";
				const sign = parsedAmount == null ? "" : parsedAmount > 0 ? "+" : parsedAmount < 0 ? "-" : "";

				return (
					<div key={t.hash} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3.5">
						<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
							<Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
						</span>
						<div className="min-w-0 flex-1">
							<p className="text-[15px] font-semibold">
								{labelFor(type, isIncoming, isOutgoing, t.delta.user)}
							</p>
							<p className="text-[13px] text-text-muted">{timeAgo(t.time)}</p>
						</div>
						<span className={`shrink-0 text-[16px] font-bold tabular-nums ${amountClass}`}>
							{parsedAmount != null ? `${sign}${formatUsd(Math.abs(parsedAmount))}` : "N/A"}
						</span>
					</div>
				);
			})}
		</div>
	);
}
