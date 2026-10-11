import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const VARIANT_STYLES: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--accent-gradient)",
    color: "var(--text-on-accent)",
    border: "1px solid transparent",
  },
  secondary: {
    background: "var(--bg-glass)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-glass-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--color-error-bg)",
    color: "var(--color-error)",
    border: "1px solid rgba(239, 68, 68, 0.35)",
  },
};

const SIZE_STYLES: Record<Size, CSSProperties> = {
  sm: { padding: "var(--space-2) var(--space-3)", fontSize: "var(--text-sm)" },
  md: { padding: "var(--space-3) var(--space-5)", fontSize: "var(--text-base)" },
  lg: { padding: "var(--space-4) var(--space-6)", fontSize: "var(--text-lg)" },
};

/**
 * The one <button> implementation in the app. Every clickable action
 * (Master Spec section 66: "no dead buttons") should render through this
 * component so loading/disabled states are consistent everywhere.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", isLoading, disabled, children, style, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--space-2)",
          borderRadius: "var(--radius-md)",
          fontWeight: "var(--font-weight-semibold)",
          cursor: disabled || isLoading ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          transition: `transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-base) var(--ease-standard)`,
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        {...rest}
      >
        {isLoading && <Loader2 size={16} className="campusiq-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
