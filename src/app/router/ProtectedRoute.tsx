import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthProvider";
import { LoadingScreen } from "@/components/feedback/LoadingScreen";

/**
 * Client-side route gating is a UX convenience (don't flash a dashboard
 * before redirecting to login) — it is NOT the security boundary. Every
 * table a logged-out or wrong-role user could theoretically still query
 * is independently protected by RLS (see supabase/migrations/012_rls.sql).
 * Manually navigating past this component, or calling Supabase directly
 * from devtools, must never grant access to anything RLS wouldn't already
 * allow — see Master Spec section 70.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
}
