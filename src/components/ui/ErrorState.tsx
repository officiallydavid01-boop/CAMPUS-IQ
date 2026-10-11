import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

/** Master Spec section 67 — user-friendly errors only; never a raw
 * database/HTTP error message reaches this component. Callers should map
 * their caught error to plain copy before rendering it here. */
export function ErrorState({
  title = "Something went wrong.",
  description = "Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="stack"
      style={{
        alignItems: "center",
        textAlign: "center",
        gap: "var(--space-3)",
        padding: "var(--space-12) var(--space-6)",
      }}
    >
      <AlertTriangle size={32} style={{ color: "var(--color-error)" }} aria-hidden="true" />
      <p style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>{title}</p>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", maxWidth: "36ch" }}>{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
