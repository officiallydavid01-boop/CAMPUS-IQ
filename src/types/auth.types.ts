import type { Session, User } from "@supabase/supabase-js";
import type { UserRole } from "@/types/database.types";

export interface AuthState {
  user: User | null;
  session: Session | null;
  roles: UserRole[];
  isLoading: boolean;
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

/** Discriminated result type so callers must handle the error case
 * explicitly instead of a thrown exception disappearing into a
 * swallowed catch block somewhere. */
export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: string };
