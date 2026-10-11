import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TONE_ICON: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

const TONE_COLOR: Record<ToastTone, string> = {
  success: "var(--color-success)",
  error: "var(--color-error)",
  info: "var(--accent-cyan)",
};

/** App-wide toast/notification-banner system. Never swallow an error
 * silently (Master Spec section 15) — call showToast("...", "error")
 * from a catch block instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: "calc(var(--space-4) + var(--safe-bottom))",
          right: "var(--space-4)",
          zIndex: "var(--z-toast)" as unknown as number,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          maxWidth: "min(90vw, 360px)",
        }}
      >
        {toasts.map((toast) => {
          const Icon = TONE_ICON[toast.tone];
          return (
            <div
              key={toast.id}
              className="glass-surface"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)",
                background: "var(--bg-surface)",
              }}
            >
              <Icon size={18} style={{ color: TONE_COLOR[toast.tone], flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
              <span style={{ fontSize: "var(--text-sm)" }}>{toast.message}</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                aria-label="Dismiss"
                style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
