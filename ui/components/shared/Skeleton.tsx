export default function Skeleton({ className = "" }: { className?: string }) {
	return <div className={`animate-pulse rounded-md bg-surface-hover ${className}`} />;
}
