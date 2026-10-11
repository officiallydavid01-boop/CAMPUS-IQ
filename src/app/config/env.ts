/**
 * Centralized, validated access to build-time environment variables.
 *
 * Importing from here (rather than reading import.meta.env directly in
 * components) means a missing/misconfigured environment fails loudly and
 * in one place, instead of as a confusing runtime error deep in a
 * Supabase call.
 */

interface CampusIQEnv {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

function readEnv(): CampusIQEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const missing: string[] = [];
  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabasePublishableKey) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");

  if (missing.length > 0) {
    // Thrown at module load time (see main.tsx) so the failure is
    // impossible to miss during local development, rather than surfacing
    // later as an opaque "fetch failed" from inside a Supabase call.
    throw new Error(
      `CampusIQ is missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill in your Supabase project's URL and publishable key.`
    );
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}

export const env = readEnv();
