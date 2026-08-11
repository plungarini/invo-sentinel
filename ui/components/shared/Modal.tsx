"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
	onClose,
	title,
	children,
}: {
	onClose: () => void;
	title?: string;
	children: React.ReactNode;
}) {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKeyDown);
		document.body.style.overflow = "hidden";
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.body.style.overflow = "";
		};
	}, [onClose]);

	return (
		<div
			className="animate-modal-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
			onClick={onClose}
		>
			<div
				className="animate-modal-content scrollbar-thin max-h-[88vh] w-full max-w-[560px] overflow-y-auto rounded-t-3xl bg-card sm:rounded-3xl"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-card/90 px-5 py-4 backdrop-blur-xl">
					<span className="text-[15px] font-semibold tracking-tight">{title ?? ""}</span>
					<button
						onClick={onClose}
						className="cursor-pointer rounded-full bg-surface p-2 text-text-muted transition-all duration-150 hover:bg-surface-hover hover:text-text active:scale-95"
						aria-label="Close"
					>
						<X className="h-4 w-4" strokeWidth={2.5} />
					</button>
				</div>
				<div className="px-5 pb-6">{children}</div>
			</div>
		</div>
	);
}
