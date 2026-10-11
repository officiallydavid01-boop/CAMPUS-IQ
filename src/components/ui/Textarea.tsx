import { forwardRef, useId, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

/** Multi-line counterpart to Input — used for lesson content fields
 * (introduction, detailed explanation, examples, formulas, notes) in the
 * Admin lesson editor. Same labeling/error/hint contract as Input. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, style, rows = 4, ...rest }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
      <div className="stack" style={{ gap: "var(--space-2)" }}>
        <label htmlFor={textareaId} style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }}>
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          style={{
            background: "var(--bg-surface-secondary)",
            border: `1px solid ${error ? "var(--color-error)" : "var(--border-glass)"}`,
            borderRadius: "var(--radius-md)",
            padding: "var(--space-3) var(--space-4)",
            color: "var(--text-primary)",
            fontSize: "var(--text-base)",
            fontFamily: "inherit",
            width: "100%",
            resize: "vertical",
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
Textarea.displayName = "Textarea";
