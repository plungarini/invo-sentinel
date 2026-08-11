"use client";

import { useState } from "react";

function initials(title: string): string {
	return title.trim().slice(0, 2).toUpperCase();
}

/**
 * Invo's followed-portfolio API has no portfolio-level image at all - only the
 * owner (a person) carries an avatar. Fallback chain is owner image -> owner's
 * own color swatch with initials -> a generic accent swatch (also catches a
 * broken/expired hotlinked avatar URL, not just a missing one).
 */
export default function PortfolioAvatar({
	title,
	avatarUrl,
	avatarColor,
	size = 9,
	className = "",
}: {
	title: string;
	avatarUrl?: string;
	avatarColor?: string;
	size?: 9 | 11;
	className?: string;
}) {
	const [imageFailed, setImageFailed] = useState(false);
	const dimension = size === 11 ? "h-11 w-11" : "h-9 w-9";
	const fontSize = size === 11 ? "text-[14px]" : "text-[12px]";

	if (avatarUrl && !imageFailed) {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				src={avatarUrl}
				alt={title}
				onError={() => setImageFailed(true)}
				className={`${dimension} shrink-0 rounded-full object-cover ${className}`}
			/>
		);
	}

	return (
		<span
			className={`flex ${dimension} shrink-0 items-center justify-center rounded-full ${fontSize} font-bold text-white ${className}`}
			style={{ backgroundColor: avatarColor ?? "var(--accent)" }}
		>
			{initials(title)}
		</span>
	);
}
