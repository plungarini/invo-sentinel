const VARIANTS = {
	primary: "bg-gradient-to-b from-cta-from to-cta-to text-white hover:brightness-110",
	secondary: "bg-surface text-text hover:bg-surface-hover",
	ghost: "text-text-muted hover:bg-surface hover:text-text",
	warning: "bg-badge-amber text-black hover:brightness-110",
} as const;

export default function Button({
	children,
	variant = "secondary",
	className = "",
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
	return (
		<button
			className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-all duration-150 ease-out active:scale-[0.97] ${VARIANTS[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
