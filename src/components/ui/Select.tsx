import { forwardRef, useId, type SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  /** Keeps the label in the DOM (and announced by screen readers) but
   * visually hidden — for compact contexts like a per-row status changer
   * inside a DataTable, where a repeated visible "Status" caption above
   * every row would be noise rather than help. */
  hideLabel?: boolean;
}

/**
 * Used throughout the onboarding / "Change Academic Context" cascading
 * dropdowns (institution -> faculty -> department -> ...). Disabling a
 * Select until its parent is chosen (via the `disabled` prop the caller
 * passes in) is how that cascade is expressed — this component itself has
 * no hierarchy awareness, which is deliberate: it stays a dumb, reusable
 * primitive and the cascade logic lives in the page that uses it.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, placeholder, error, hideLabel, id, style, ...rest }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;

    return (
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <label
          htmlFor={selectId}
          className={hideLabel ? "visually-hidden" : undefined}
          style={hideLabel ? undefined : { fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }}
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error) || undefined}
          style={{
            background: "var(--bg-surface-secondary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--border-glass)"}`,
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-4)",
            color: "var(--text-primary)",
            fontSize: "var(--text-base)",
            width: "100%",
            opacity: rest.disabled ? 0.5 : 1,
            ...style,
          }}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <span role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--color-error)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
