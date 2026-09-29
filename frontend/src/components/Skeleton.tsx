export default function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton animate-shimmer rounded ${className}`} />;
}
