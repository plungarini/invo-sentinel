"use client";

import Button from "./Button";
import Modal from "./Modal";

export default function ConfirmDialog({
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	confirmVariant = "primary",
	onConfirm,
	onCancel,
}: {
	title?: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	confirmVariant?: "primary" | "secondary" | "ghost" | "warning";
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Modal onClose={onCancel} title={title}>
			<div className="flex flex-col gap-5">
				<p className="text-[14px] text-text-muted">{message}</p>
				<div className="flex justify-end gap-3">
					<Button variant="ghost" onClick={onCancel}>
						{cancelLabel}
					</Button>
					<Button variant={confirmVariant} onClick={onConfirm}>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</Modal>
	);
}
