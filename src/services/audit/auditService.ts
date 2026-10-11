import { supabase } from "@/services/supabase/client";

/**
 * Writes one row to admin_audit_logs (Master Spec section 72). Called by
 * every Admin CRUD service function right after a mutation succeeds —
 * see services/academic/academicService.ts and
 * services/courses/adminCoursesService.ts for call sites.
 *
 * Deliberately "fire and forget" from the caller's perspective: a failed
 * audit-log write should never roll back or block the actual admin action
 * (the thing being audited already succeeded by the time this runs), so
 * this swallows its own errors after logging them to the console rather
 * than throwing. The actor is read server-side via auth.uid() implicitly
 * through RLS's `is_staff()` check on the insert — we still pass actor_id
 * explicitly so the row is self-contained and queryable without a join.
 */
export async function logAuditEvent(
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from("admin_audit_logs").insert({
    actor_id: userData.user?.id ?? null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to write audit log for ${action}:`, error);
  }
}
