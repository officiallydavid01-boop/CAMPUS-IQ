import type { ReactNode } from "react";
import { HolographicBrain } from "@/components/branding/HolographicBrain";
import { GlassCard } from "@/components/ui/GlassCard";

/**
 * The "visual showcase" login/register/reset shell (Master Spec section
 * 11): midnight background, aurora gradient (from globals.css body
 * background), glass card, holographic brain. Desktop gets a two-column
 * split; mobile/tablet stack to one column — see the media query below.
 */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <div
        className="auth-split"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-8)",
          width: "100%",
          maxWidth: "440px",
        }}
      >
        <div className="stack" style={{ alignItems: "center", gap: "var(--space-3)", textAlign: "center" }}>
          <HolographicBrain size={56} />
          <h1 style={{ fontSize: "var(--text-2xl)" }}>{title}</h1>
          {subtitle && <p style={{ fontSize: "var(--text-sm)" }}>{subtitle}</p>}
        </div>
        <GlassCard>{children}</GlassCard>
      </div>
    </div>
  );
}
