import type { ReactNode } from "react";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Single composition point for every app-wide provider. Adding a new one
 * (theme, i18n, ...) in a later phase means editing this file only, not
 * every entry point that renders <App />.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>{children}</ToastProvider>
    </AuthProvider>
  );
}
