import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { env } from "@/app/config/env";

/**
 * The single Supabase client instance for the whole app.
 *
 * Every feature service (services/auth, services/academic, ...) should
 * import `supabase` from here rather than constructing its own client.
 * This keeps auth/session state consistent and makes it possible to
 * swap client configuration (e.g. storage, headers) in exactly one place.
 *
 * Only the publishable (public) key is ever used on the client. Anything
 * that requires the service_role key (bulk admin imports, privileged XP
 * grants, etc.) must go through a Supabase Edge Function — never through
 * this client directly.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
