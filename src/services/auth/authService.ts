import { supabase } from "@/services/supabase/client";
import type { AuthResult, SignInInput, SignUpInput } from "@/types/auth.types";
import type { UserRole } from "@/types/database.types";

/**
 * All Supabase Auth calls go through this module — components and hooks
 * never call `supabase.auth.*` directly. That keeps error-message
 * normalization (see mapAuthError) and any future cross-cutting concern
 * (analytics, rate-limit backoff) in one place.
 */

function mapAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Supabase returns fairly technical messages; translate the common ones
  // into the user-facing copy the Master Spec's error-states section asks
  // for ("useful, user-friendly errors... do not expose raw database
  // errors").
  if (/invalid login credentials/i.test(message)) return "Incorrect email or password.";
  if (/email not confirmed/i.test(message)) return "Please verify your email before logging in.";
  if (/user already registered/i.test(message)) return "An account with this email already exists.";
  if (/network/i.test(message)) return "Network error — please check your connection and try again.";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a moment and try again.";

  return message || "Something went wrong. Please try again.";
}

export async function signUp({ email, password, fullName }: SignUpInput): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: mapAuthError(error) };
  }
}

export async function signIn({ email, password }: SignInInput): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: mapAuthError(error) };
  }
}

export async function signOut(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: mapAuthError(error) };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    });
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: mapAuthError(error) };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: mapAuthError(error) };
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: mapAuthError(error) };
  }
}

/**
 * Reads the current user's roles from user_roles/roles. This is a plain
 * SELECT protected by RLS ("user can read own roles" in 012_rls.sql) — it
 * is informational only and must never be treated as an authorization
 * decision by itself. The actual authorization decision for any protected
 * action is made server-side (RLS policies, or is_admin()/is_staff() used
 * inside a policy) — see docs/database-architecture.md "Why routes are
 * not the security boundary".
 */
export async function fetchCurrentUserRoles(userId: string): Promise<UserRole[]> {
  if (!userId) return [];

  // The caller supplies the user id from the established Supabase session.
  // Do not call auth.getUser() from onAuthStateChange: Supabase warns that
  // auth methods awaited inside that callback can deadlock the auth lock.
  // The database still enforces the identity boundary with RLS.
  const { data: grants, error: grantsError } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);

  if (grantsError || !grants || grants.length === 0) return [];

  const { data: roleRows, error: rolesError } = await supabase
    .from("roles")
    .select("name")
    .in(
      "id",
      grants.map((g) => g.role_id)
    );

  if (rolesError || !roleRows) return [];

  return roleRows.map((r) => r.name);
}
