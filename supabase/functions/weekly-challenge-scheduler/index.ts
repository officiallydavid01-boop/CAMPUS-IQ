import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  const schedulerSecret = Deno.env.get("CAMPUSIQ_SCHEDULER_SECRET");
  const suppliedAuthorization = request.headers.get("authorization") ?? "";
  if (!schedulerSecret || suppliedAuthorization !== `Bearer ${schedulerSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json({ error: "Scheduler environment is not configured" }, { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("run_weekly_challenge_scheduler");
  if (error) {
    console.error("Weekly challenge scheduler failed", error.message);
    return Response.json({ error: "Weekly challenge generation failed" }, { status: 500, headers: corsHeaders });
  }

  const rows = Array.isArray(data) ? data : [];
  return Response.json({
    ok: true,
    generated: rows.filter((row: { outcome?: string }) => row.outcome === "created").length,
    alreadyExisted: rows.filter((row: { outcome?: string }) => row.outcome === "already_exists").length,
    occurrences: rows,
  }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
