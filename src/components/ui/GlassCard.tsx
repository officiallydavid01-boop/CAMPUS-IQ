import type { HTMLAttributes, ReactNode } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  padding?: string;
}

/**
 * The one glassmorphism surface implementation (Master Spec section 9:
 * "implement glassmorphism as an actual design system," not scattered
 * one-off `backdrop-filter` declarations). Every card-shaped surface in
 * the app should be this, or compose it, so the "90% calm / 10%
 * spectacle" balance stays centrally tunable via .glass-surface in
 * styles/components.css.
 */
export function GlassCard({ children, interactive, padding = "var(--space-6)", className, style, ...rest }: GlassCardProps) {
  return (
    <div
      className={`glass-surface ${interactive ? "glass-surface--interactive" : ""} ${className ?? ""}`.trim()}
      style={{ padding, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
