import { Loader2 } from "lucide-react";

export function Spinner({ size = 20, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span role="status" aria-live="polite" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <Loader2 size={size} className="campusiq-spin" aria-hidden="true" style={{ color: "var(--accent-cyan)" }} />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
