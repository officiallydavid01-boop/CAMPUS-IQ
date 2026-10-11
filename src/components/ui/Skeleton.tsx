export function Skeleton({ width = "100%", height = "1rem", radius }: { width?: string; height?: string; radius?: string }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} height="0.875rem" />
      ))}
    </div>
  );
}
