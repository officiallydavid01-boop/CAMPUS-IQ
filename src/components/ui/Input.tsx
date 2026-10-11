import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

/**
 * Every text field in the app renders through this component so labels,
 * error states and focus rings stay consistent (Master Spec section 64:
 * "accessible forms"). `label` is required — there is no visually-hidden
 * escape hatch, because an unlabeled input is exactly the kind of
 * accessibility gap the spec calls out.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, style, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <label htmlFor={inputId} style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }}>
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          style={{
            background: "var(--bg-surface-secondary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--border-glass)"}`,
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-4)",
            color: "var(--text-primary)",
            fontSize: "var(--text-base)",
            width: "100%",
            ...style,
          }}
          {...rest}
        />
        {hint && !error && (
          <span id={hintId} style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {hint}
          </span>
        )}
        {error && (
          <span id={errorId} role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--color-error)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
