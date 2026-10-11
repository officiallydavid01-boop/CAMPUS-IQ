import type { ReactNode, CSSProperties } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "error" | "accent";

const TONE_STYLES: Record<BadgeTone, CSSProperties> = {
  neutral: { background: "var(--bg-glass)", color: "var(--text-secondary)" },
  success: { background: "var(--color-success-bg)", color: "var(--color-success)" },
  warning: { background: "var(--color-warning-bg)", color: "var(--color-warning)" },
  error: { background: "var(--color-error-bg)", color: "var(--color-error)" },
  accent: { background: "rgba(0, 229, 255, 0.12)", color: "var(--accent-cyan)" },
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="badge" style={TONE_STYLES[tone]}>
      {children}
    </span>
  );
}

/** Maps the content_status enum straight to a Badge tone so every list/
 * table in the Admin CMS renders status consistently (Master Spec
 * section 23: Draft/Review/Published/Archived). */
export function StatusBadge({ status }: { status: "draft" | "review" | "published" | "archived" }) {
  const toneByStatus: Record<typeof status, BadgeTone> = {
    draft: "neutral",
    review: "warning",
    published: "success",
    archived: "error",
  };
  return <Badge tone={toneByStatus[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}
