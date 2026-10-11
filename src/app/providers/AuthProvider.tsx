import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { fetchCurrentUserRoles } from "@/services/auth/authService";
import type { UserRole } from "@/types/database.types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: UserRole[];
  isLoading: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STAFF_ROLES: UserRole[] = ["super_admin", "admin", "content_editor", "moderator"];
const ADMIN_ROLES: UserRole[] = ["super_admin", "admin"];

/**
 * Wraps the whole app. Listens to Supabase's auth state changes (the
 * single source of truth for "am I logged in") and additionally loads the
 * user's roles for UI purposes (showing/hiding the Admin nav item, etc).
 *
 * This is a *convenience* layer only — it must never be the actual
 * security boundary. A student with JavaScript disabled, a stale bundle,
 * or a hand-crafted request bypasses all of this entirely, which is
 * exactly why every admin-sensitive table has its own RLS policy that
 * re-checks is_admin()/is_staff() server-side regardless of what this
 * provider believes.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const roleLoadVersion = useRef(0);

  const loadRoles = useCallback(async (userId: string | undefined, finishBootstrap = false): Promise<void> => {
    const version = ++roleLoadVersion.current;
    if (!userId) {
      setRoles([]);
      if (finishBootstrap) setIsLoading(false);
      return;
    }

    try {
      const nextRoles = await fetchCurrentUserRoles(userId);
      // Ignore stale role responses if the user signs out or changes session
      // while the database request is still in flight.
      if (version === roleLoadVersion.current) setRoles(nextRoles);
    } catch {
      if (version === roleLoadVersion.current) setRoles([]);
    } finally {
      if (finishBootstrap && version === roleLoadVersion.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let authEventSeen = false;

    // Keep the callback synchronous. Role loading is started in the
    // background and never awaited while Supabase holds its auth lock.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      authEventSeen = true;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(Boolean(nextSession?.user));
      void loadRoles(nextSession?.user?.id, true);
    });

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!isMounted || authEventSeen) return;
        const nextSession = error ? null : data.session;
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setIsLoading(Boolean(nextSession?.user));
        void loadRoles(nextSession?.user?.id, true);
      })
      .catch(() => {
        if (!isMounted || authEventSeen) return;
        setSession(null);
        setUser(null);
        setRoles([]);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
      roleLoadVersion.current += 1;
      authListener.subscription.unsubscribe();
    };
  }, [loadRoles]);

  const value: AuthContextValue = {
    user,
    session,
    roles,
    isLoading,
    isAdmin: roles.some((r) => ADMIN_ROLES.includes(r)),
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    refreshRoles: () => loadRoles(user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
