export default function BigNumber({ value, className = "" }: { value: number; className?: string }) {
	const sign = value < 0 ? "-" : "";
	const [intPart, decPart] = Math.abs(value).toFixed(2).split(".");

	return (
		<span className={`tabular-nums tracking-[-0.02em] ${className}`}>
			{sign}${Number(intPart).toLocaleString("en-US")}
			<span className="text-text-muted">.{decPart}</span>
		</span>
	);
}
