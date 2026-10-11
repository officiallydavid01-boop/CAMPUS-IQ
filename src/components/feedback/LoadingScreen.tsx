import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { Spinner } from "@/components/ui/Spinner";

/** Full-viewport loading state used while auth/session is being resolved
 * — never render a blank white/black screen (Master Spec section 66). */
export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
      }}
    >
      <HolographicBrain size={64} />
      <Spinner label={label} />
      <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>{label}</p>
    </div>
  );
}
