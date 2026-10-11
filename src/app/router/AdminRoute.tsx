import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/app/providers/AuthProvider";
import { LoadingScreen } from "@/components/feedback/LoadingScreen";

/**
 * See the security note in ProtectedRoute.tsx: this hides the Admin shell
 * from the nav/UI for non-staff, but the real gate is RLS's is_staff()/
 * is_admin() checks (012_rls.sql). Typing /admin into the address bar
 * with a student account renders this shell (once past this guard, for a
 * staff user) with zero admin-only data in it, because every query it
 * makes is independently rejected server-side for a non-staff caller.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isStaff, isLoading } = useAuth();

  if (isLoading) return <LoadingScreen label="Checking permissions…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
