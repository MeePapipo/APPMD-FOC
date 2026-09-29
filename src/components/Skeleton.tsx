/** Placeholder block for route-level loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-canvas ${className}`} />;
}

export function SkeletonPage({ label, rows = 6 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto max-w-4xl space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="space-y-2 pt-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
