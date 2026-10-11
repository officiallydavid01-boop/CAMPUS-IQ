-- CampusIQ post-install security hardening, verified against live linter findings.
-- Trigger functions must not be callable as RPCs by browser roles.
revoke all on function public.ci_audit_phase7_row() from public, anon, authenticated;
revoke all on function public.ci_refresh_user_levels() from public, anon, authenticated;
revoke all on function public.grade_practice_answer() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_lesson_progress_xp() from public, anon, authenticated;
revoke all on function public.protect_profile_admin_fields() from public, anon, authenticated;
revoke all on function public.recalculate_user_xp() from public, anon, authenticated;
revoke all on function public.validate_course_offering_context() from public, anon, authenticated;
revoke all on function public.validate_profile_academic_context() from public, anon, authenticated;

-- Graded-answer retrieval is authenticated-only and its function enforces attempt ownership/staff access.
revoke all on function public.get_graded_attempt_correct_answers(uuid) from public, anon;
grant execute on function public.get_graded_attempt_correct_answers(uuid) to authenticated;

-- Pin trigger-function search paths to trusted schemas.
alter function public.set_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.ci_prevent_level_config_delete() set search_path = pg_catalog, public, pg_temp;
