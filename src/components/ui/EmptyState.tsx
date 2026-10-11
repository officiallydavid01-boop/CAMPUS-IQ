import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Master Spec section 68 — every list view needs a real empty state
 * ("No courses found.", "No competitions are currently available.", ...)
 * instead of a blank area. */
export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div
      className="stack"
      style={{
        alignItems: "center",
        textAlign: "center",
        gap: "var(--space-3)",
        padding: "var(--space-12) var(--space-6)",
        color: "var(--text-secondary)",
      }}
    >
      <Icon size={32} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
      <p style={{ color: "var(--text-primary)", fontWeight: "var(--font-weight-medium)" }}>{title}</p>
      {description && <p style={{ fontSize: "var(--text-sm)", maxWidth: "32ch" }}>{description}</p>}
      {action}
    </div>
  );
}
