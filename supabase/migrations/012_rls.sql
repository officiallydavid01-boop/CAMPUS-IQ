-- CampusIQ — Migration 012: Row Level Security
--
-- RLS is mandatory on every table (Master Spec section 71). This file is
-- organized by domain, and each block is preceded by a short summary of
-- who can SELECT / INSERT / UPDATE / DELETE, per the "RLS design
-- requirements" checklist in the spec (section 71-72). Authorization
-- checks call the helper functions defined in 003_profiles_roles.sql
-- (has_role / is_super_admin / is_admin / is_staff) rather than
-- duplicating role logic inline.
--
-- Two conventions used throughout:
--   1. "Nobody" (no policy at all) is the default-deny answer for actions
--      that should never happen through the client API — e.g. deleting an
--      audit log row. Absence of a policy is itself the security control.
--   2. Where a student-writable table has a column that must never be
--      client-set to an unearned value (an is_correct flag, an XP amount,
--      a final score), the policy's WITH CHECK constrains that column
--      directly (e.g. `with check (is_correct is null)`) rather than
--      relying on the application to behave. See the "grading & anti-cheat"
--      note in each relevant block.

-- ---------------------------------------------------------------------
-- Enable RLS on every table in one pass
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end;
$$;

-- ======================================================================
-- ROLES / PERMISSIONS / PROFILES
-- ======================================================================

-- roles / permissions / role_permissions: catalogue tables.
-- SELECT: staff. INSERT/UPDATE/DELETE: super_admin only — these define
-- what every role in the system is *capable* of, so they get the
-- narrowest possible write access (spec section 72 calls these out by
-- name as needing extra care).
create policy "staff can read roles" on public.roles for select using (public.is_staff());
create policy "super_admin manages roles" on public.roles for all
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff can read permissions" on public.permissions for select using (public.is_staff());
create policy "super_admin manages permissions" on public.permissions for all
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy "staff can read role_permissions" on public.role_permissions for select using (public.is_staff());
create policy "super_admin manages role_permissions" on public.role_permissions for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- user_roles: who holds what role. A user may see their own role grants;
-- staff may see everyone's. Only super_admin may grant/revoke — this is
-- the table that ultimately decides who can act as Admin, so it does not
-- trust "admin" (a role that could itself be compromised) to extend
-- itself or others.
create policy "user can read own roles" on public.user_roles for select
  using (user_id = auth.uid() or public.is_staff());
create policy "super_admin manages user_roles" on public.user_roles for insert
  with check (public.is_super_admin());
create policy "super_admin updates user_roles" on public.user_roles for update
  using (public.is_super_admin()) with check (public.is_super_admin());
create policy "super_admin deletes user_roles" on public.user_roles for delete
  using (public.is_super_admin());

-- profiles: a student can read/update their own profile. Staff can read
-- everyone's (user management, support) and update account_status /
-- academic placement on anyone's behalf. Ordinary students must not be
-- able to set their own account_status (e.g. un-suspend themselves) —
-- enforced below by a trigger, since RLS itself is row- not column-scoped.
create policy "user can read own profile" on public.profiles for select
  using (id = auth.uid() or public.is_staff());
create policy "user can update own profile" on public.profiles for update
  using (id = auth.uid() or public.is_staff())
  with check (id = auth.uid() or public.is_staff());
-- No client-side INSERT/DELETE policy: rows are created only by
-- handle_new_user() (003) and removed only via auth.users cascade.

create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    -- A non-staff caller may update their own name/avatar/bio/preferences/
    -- onboarding placement, but never their own account_status.
    new.account_status := old.account_status;
  end if;
  return new;
end;
$$;

create trigger protect_profile_admin_fields
  before update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- ======================================================================
-- ACADEMIC HIERARCHY (institutions .. semesters)
-- ======================================================================
-- SELECT: any authenticated user when is_active; staff see inactive rows
-- too (so they can re-activate/archive them from the CMS).
-- INSERT/UPDATE/DELETE: is_admin() only — structural academic data, not
-- day-to-day content, so content_editor/moderator do not get write access.

create policy "read active institutions" on public.institutions for select
  using (is_active or public.is_staff());
create policy "admin manages institutions" on public.institutions for insert with check (public.is_admin());
create policy "admin updates institutions" on public.institutions for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes institutions" on public.institutions for delete using (public.is_admin());

create policy "read active faculties" on public.faculties for select
  using (is_active or public.is_staff());
create policy "admin manages faculties" on public.faculties for insert with check (public.is_admin());
create policy "admin updates faculties" on public.faculties for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes faculties" on public.faculties for delete using (public.is_admin());

create policy "read active departments" on public.departments for select
  using (is_active or public.is_staff());
create policy "admin manages departments" on public.departments for insert with check (public.is_admin());
create policy "admin updates departments" on public.departments for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes departments" on public.departments for delete using (public.is_admin());

create policy "read active programmes" on public.programmes for select
  using (is_active or public.is_staff());
create policy "admin manages programmes" on public.programmes for insert with check (public.is_admin());
create policy "admin updates programmes" on public.programmes for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes programmes" on public.programmes for delete using (public.is_admin());

create policy "read active levels" on public.levels for select
  using (is_active or public.is_staff());
create policy "admin manages levels" on public.levels for insert with check (public.is_admin());
create policy "admin updates levels" on public.levels for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes levels" on public.levels for delete using (public.is_admin());

create policy "read academic_sessions" on public.academic_sessions for select using (true);
create policy "admin manages academic_sessions" on public.academic_sessions for insert with check (public.is_admin());
create policy "admin updates academic_sessions" on public.academic_sessions for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes academic_sessions" on public.academic_sessions for delete using (public.is_admin());

create policy "read semesters" on public.semesters for select using (true);
create policy "admin manages semesters" on public.semesters for insert with check (public.is_admin());
create policy "admin updates semesters" on public.semesters for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes semesters" on public.semesters for delete using (public.is_admin());

-- ======================================================================
-- COURSES & CONTENT (courses, offerings, topics, lessons, materials)
-- ======================================================================
-- SELECT: published content to any authenticated user; staff see every
-- status (draft/review/published/archived) for CMS editing/preview.
-- INSERT/UPDATE/DELETE: is_staff() — content_editor is the intended
-- day-to-day owner of this domain.

create policy "read published courses" on public.courses for select
  using (status = 'published' or public.is_staff());
create policy "staff writes courses" on public.courses for insert with check (public.is_staff());
create policy "staff updates courses" on public.courses for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes courses" on public.courses for delete using (public.is_staff());

create policy "read published course_offerings" on public.course_offerings for select
  using (status = 'published' or public.is_staff());
create policy "staff writes course_offerings" on public.course_offerings for insert with check (public.is_staff());
create policy "staff updates course_offerings" on public.course_offerings for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes course_offerings" on public.course_offerings for delete using (public.is_staff());

create policy "read published course_topics" on public.course_topics for select
  using (status = 'published' or public.is_staff());
create policy "staff writes course_topics" on public.course_topics for insert with check (public.is_staff());
create policy "staff updates course_topics" on public.course_topics for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes course_topics" on public.course_topics for delete using (public.is_staff());

create policy "read published lessons" on public.lessons for select
  using (status = 'published' or public.is_staff());
create policy "staff writes lessons" on public.lessons for insert with check (public.is_staff());
create policy "staff updates lessons" on public.lessons for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes lessons" on public.lessons for delete using (public.is_staff());

create policy "read published materials" on public.materials for select
  using (status = 'published' or public.is_staff());
create policy "staff writes materials" on public.materials for insert with check (public.is_staff());
create policy "staff updates materials" on public.materials for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes materials" on public.materials for delete using (public.is_staff());

-- course_enrollments: a student manages their own enrollment; staff can
-- see/manage everyone's (advising, support, corrections).
create policy "read own enrollments" on public.course_enrollments for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student self-enrolls" on public.course_enrollments for insert
  with check (student_id = auth.uid() or public.is_staff());
create policy "student updates own enrollment" on public.course_enrollments for update
  using (student_id = auth.uid() or public.is_staff())
  with check (student_id = auth.uid() or public.is_staff());
create policy "staff deletes enrollments" on public.course_enrollments for delete using (public.is_staff());

-- lesson_progress / topic_progress: fully self-service, since this is the
-- student's own record of what they've done. The xp_awarded flag on
-- lesson_progress is protected two ways: the INSERT policy's WITH CHECK
-- requires it to start false (a student cannot even create their own row
-- pre-marked as XP-awarded), and protect_lesson_progress_xp() (below)
-- stops a later UPDATE from flipping it back to false to re-trigger an
-- award. Actually setting it true happens only in the Phase 6 award
-- function, which — like the grading functions discussed in
-- docs/database-architecture.md "XP & grading security model" — runs
-- with elevated (table-owner) privilege and so isn't limited by this
-- policy the way an ordinary student session is.
create policy "read own lesson_progress" on public.lesson_progress for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student writes own lesson_progress" on public.lesson_progress for insert
  with check (student_id = auth.uid() and xp_awarded = false);
create policy "student updates own lesson_progress" on public.lesson_progress for update
  using (student_id = auth.uid() or public.is_staff())
  with check (student_id = auth.uid() or public.is_staff());

create or replace function public.protect_lesson_progress_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    new.xp_awarded := old.xp_awarded;
  end if;
  return new;
end;
$$;

create trigger protect_lesson_progress_xp
  before update on public.lesson_progress
  for each row execute function public.protect_lesson_progress_xp();

create policy "read own topic_progress" on public.topic_progress for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student writes own topic_progress" on public.topic_progress for insert
  with check (student_id = auth.uid());
create policy "student updates own topic_progress" on public.topic_progress for update
  using (student_id = auth.uid() or public.is_staff())
  with check (student_id = auth.uid() or public.is_staff());

-- notes / bookmarks / study_sessions / planner_tasks: fully private,
-- fully self-service. Staff have no special access — these are personal.
create policy "own notes only" on public.notes for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "own bookmarks only" on public.bookmarks for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "own study_sessions only" on public.study_sessions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "own planner_tasks only" on public.planner_tasks for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ======================================================================
-- QUESTION BANK, PAST QUESTIONS, EXAMS, PRACTICE
-- ======================================================================
-- IMPORTANT / KNOWN LIMITATION (documented in docs/database-architecture.md
-- "XP & grading security model"): question_options is staff-read-only at
-- the table level, because RLS cannot hide a single column (is_correct)
-- from an otherwise-visible row. Two views below (questions_public,
-- question_options_public) give students a safe, is_correct-free way to
-- read question content; the actual answer-delivery/grading RPC that
-- exams and practice sessions call is a Phase 5 deliverable, not this one.

create policy "read published questions (staff)" on public.questions for select
  using (public.is_staff());
create policy "staff writes questions" on public.questions for insert with check (public.is_staff());
create policy "staff updates questions" on public.questions for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes questions" on public.questions for delete using (public.is_staff());

create policy "staff only question_options" on public.question_options for select using (public.is_staff());
create policy "staff writes question_options" on public.question_options for insert with check (public.is_staff());
create policy "staff updates question_options" on public.question_options for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes question_options" on public.question_options for delete using (public.is_staff());

create view public.questions_public
  with (security_invoker = false) as
  select id, course_id, topic_id, question_type, prompt, difficulty, xp_value, status, created_at
  from public.questions
  where status = 'published';
comment on view public.questions_public is
  'Student-safe question view: omits correct_answer_text and explanation. '
  'Owned by the migration role so it can read public.questions regardless '
  'of the querying student''s own (staff-only) RLS on that table.';
grant select on public.questions_public to authenticated;

create view public.question_options_public
  with (security_invoker = false) as
  select qo.id, qo.question_id, qo.option_text, qo.display_order
  from public.question_options qo
  join public.questions q on q.id = qo.question_id
  where q.status = 'published';
comment on view public.question_options_public is
  'Student-safe options view: omits is_correct.';
grant select on public.question_options_public to authenticated;

create policy "read published past_questions" on public.past_questions for select
  using (status = 'published' or public.is_staff());
create policy "staff writes past_questions" on public.past_questions for insert with check (public.is_staff());
create policy "staff updates past_questions" on public.past_questions for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes past_questions" on public.past_questions for delete using (public.is_staff());

create policy "read published exams" on public.exams for select
  using (status = 'published' or public.is_staff());
create policy "staff writes exams" on public.exams for insert with check (public.is_staff());
create policy "staff updates exams" on public.exams for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes exams" on public.exams for delete using (public.is_staff());

create policy "staff only exam_questions" on public.exam_questions for select using (public.is_staff());
create policy "staff writes exam_questions" on public.exam_questions for insert with check (public.is_staff());
create policy "staff updates exam_questions" on public.exam_questions for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes exam_questions" on public.exam_questions for delete using (public.is_staff());

-- exam_attempts: a student may start an attempt and submit it, but may
-- never write a score or jump straight to 'graded' — the USING clause only
-- exposes their own in_progress row for update, and WITH CHECK only ever
-- allows the in_progress -> submitted transition with score/xp untouched.
-- Staff (or a future SECURITY DEFINER grading function acting with
-- elevated privilege) perform the actual grading UPDATE.
create policy "read own exam_attempts" on public.exam_attempts for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student starts exam_attempt" on public.exam_attempts for insert
  with check (student_id = auth.uid() and status = 'in_progress' and score is null and xp_awarded = 0);
create policy "student submits own exam_attempt" on public.exam_attempts for update
  using (student_id = auth.uid() and status = 'in_progress')
  with check (student_id = auth.uid() and status = 'submitted' and score is null and xp_awarded = 0);
create policy "staff grades exam_attempts" on public.exam_attempts for update
  using (public.is_staff()) with check (public.is_staff());

create policy "read own exam_answers" on public.exam_answers for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.exam_attempts ea
      where ea.id = exam_answers.exam_attempt_id and ea.student_id = auth.uid()
    )
  );
create policy "student answers own exam" on public.exam_answers for insert
  with check (
    is_correct is null
    and exists (
      select 1 from public.exam_attempts ea
      where ea.id = exam_answers.exam_attempt_id
        and ea.student_id = auth.uid()
        and ea.status = 'in_progress'
    )
  );
create policy "staff grades exam_answers" on public.exam_answers for update
  using (public.is_staff()) with check (public.is_staff());

-- practice_sessions / practice_answers: lower-stakes than exams (no
-- official transcript impact) but the same is_correct-is-server-set
-- principle applies.
create policy "own practice_sessions" on public.practice_sessions for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student starts practice_session" on public.practice_sessions for insert
  with check (student_id = auth.uid() and xp_awarded = 0);
create policy "student updates own practice_session" on public.practice_sessions for update
  using (student_id = auth.uid() or public.is_staff())
  with check (
    public.is_staff()
    or (student_id = auth.uid() and xp_awarded = 0)
  );

create policy "read own practice_answers" on public.practice_answers for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.practice_sessions ps
      where ps.id = practice_answers.practice_session_id and ps.student_id = auth.uid()
    )
  );
create policy "student answers own practice" on public.practice_answers for insert
  with check (
    is_correct is null
    and exists (
      select 1 from public.practice_sessions ps
      where ps.id = practice_answers.practice_session_id and ps.student_id = auth.uid()
    )
  );
create policy "staff grades practice_answers" on public.practice_answers for update
  using (public.is_staff()) with check (public.is_staff());

-- ======================================================================
-- GAMIFICATION (XP, levels, streaks, achievements, quests)
-- ======================================================================
-- xp_transactions is an append-only ledger. A student may read their own
-- entries; only staff may INSERT directly (the "admin_grant" source).
-- Legitimate automatic awards (lesson completion, practice, exams,
-- quests, achievements) are written by SECURITY DEFINER functions
-- introduced in later phases, which run with the privileges of their
-- owning role rather than the calling student's — see
-- docs/database-architecture.md "XP & grading security model" for the
-- exact mechanism and its caveats. No UPDATE/DELETE policy exists for
-- anyone: the ledger is immutable by design (corrections are made by
-- inserting an offsetting transaction, never by editing history).
create policy "read own xp_transactions" on public.xp_transactions for select
  using (student_id = auth.uid() or public.is_staff());
create policy "staff grants xp" on public.xp_transactions for insert
  with check (public.is_staff() and source = 'admin_grant');

-- user_xp is maintained solely by the recalculate_user_xp() trigger
-- (007_gamification.sql), which runs SECURITY DEFINER. No INSERT/UPDATE/
-- DELETE policy is defined for any client role, staff included — the
-- ledger is the only legitimate way to change a balance.
create policy "read own user_xp" on public.user_xp for select
  using (student_id = auth.uid() or public.is_staff());

create policy "read level_config" on public.level_config for select using (true);
create policy "admin writes level_config" on public.level_config for insert with check (public.is_admin());
create policy "admin updates level_config" on public.level_config for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes level_config" on public.level_config for delete using (public.is_admin());

-- streaks: read-only for the student; written only by the (future)
-- server-side activity-tracking function, so no client UPDATE policy
-- exists for non-staff (staff retains an escape hatch for support
-- corrections).
create policy "read own streaks" on public.streaks for select
  using (student_id = auth.uid() or public.is_staff());
create policy "staff corrects streaks" on public.streaks for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff inserts streaks" on public.streaks for insert with check (public.is_staff());

create policy "read active achievements" on public.achievements for select
  using (is_active or public.is_staff());
create policy "staff writes achievements" on public.achievements for insert with check (public.is_staff());
create policy "staff updates achievements" on public.achievements for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes achievements" on public.achievements for delete using (public.is_staff());

-- user_achievements: a student can see which achievements they've earned,
-- but cannot award themselves one — that happens via a server-side
-- function when the qualifying condition is met, or directly by staff.
create policy "read own user_achievements" on public.user_achievements for select
  using (student_id = auth.uid() or public.is_staff());
create policy "staff awards achievements" on public.user_achievements for insert with check (public.is_staff());

create policy "read active quests" on public.quests for select
  using (is_active or public.is_staff());
create policy "staff writes quests" on public.quests for insert with check (public.is_staff());
create policy "staff updates quests" on public.quests for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes quests" on public.quests for delete using (public.is_staff());

-- quest_progress: read-only for the student. Incrementing progress is
-- driven by the same server-side activity functions that award XP/
-- streaks — never by the student directly setting current_count, which
-- would trivially let them claim quest rewards without doing the work.
create policy "read own quest_progress" on public.quest_progress for select
  using (student_id = auth.uid() or public.is_staff());
create policy "staff writes quest_progress" on public.quest_progress for insert with check (public.is_staff());
create policy "staff updates quest_progress" on public.quest_progress for update
  using (public.is_staff()) with check (public.is_staff());

-- ======================================================================
-- COMPETITIONS
-- ======================================================================
create policy "read visible competitions" on public.competitions for select
  using (status in ('scheduled', 'live', 'completed', 'archived') or public.is_staff());
create policy "staff writes competitions" on public.competitions for insert with check (public.is_staff());
create policy "staff updates competitions" on public.competitions for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes competitions" on public.competitions for delete using (public.is_staff());

create policy "staff only competition_rules" on public.competition_rules for select using (public.is_staff());
create policy "staff writes competition_rules" on public.competition_rules for insert with check (public.is_staff());
create policy "staff updates competition_rules" on public.competition_rules for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes competition_rules" on public.competition_rules for delete using (public.is_staff());

create policy "staff only competition_questions" on public.competition_questions for select using (public.is_staff());
create policy "staff writes competition_questions" on public.competition_questions for insert with check (public.is_staff());
create policy "staff deletes competition_questions" on public.competition_questions for delete using (public.is_staff());

create policy "read own competition_participants" on public.competition_participants for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student registers for competition" on public.competition_participants for insert
  with check (student_id = auth.uid());
create policy "student withdraws from competition" on public.competition_participants for delete
  using (student_id = auth.uid() or public.is_staff());

-- competition_attempts: identical anti-cheat shape to exam_attempts —
-- a student can start and submit their own attempt, but score/
-- disqualified are staff/grading-function-only.
create policy "read own competition_attempts" on public.competition_attempts for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student starts competition_attempt" on public.competition_attempts for insert
  with check (student_id = auth.uid() and status = 'in_progress' and score is null and not disqualified);
create policy "student submits competition_attempt" on public.competition_attempts for update
  using (student_id = auth.uid() and status = 'in_progress')
  with check (student_id = auth.uid() and status = 'submitted' and score is null);
create policy "staff grades competition_attempts" on public.competition_attempts for update
  using (public.is_staff()) with check (public.is_staff());

create policy "read own competition_answers" on public.competition_answers for select
  using (
    public.is_staff()
    or exists (
      select 1 from public.competition_attempts ca
      where ca.id = competition_answers.competition_attempt_id and ca.student_id = auth.uid()
    )
  );
create policy "student answers own competition" on public.competition_answers for insert
  with check (
    is_correct is null
    and exists (
      select 1 from public.competition_attempts ca
      where ca.id = competition_answers.competition_attempt_id
        and ca.student_id = auth.uid()
        and ca.status = 'in_progress'
    )
  );
create policy "staff grades competition_answers" on public.competition_answers for update
  using (public.is_staff()) with check (public.is_staff());

-- competition_results: authoritative and staff/grading-function-write-only.
-- Students may read only their own row, and only once published.
create policy "read own published competition_results" on public.competition_results for select
  using ((published and student_id = auth.uid()) or public.is_staff());
create policy "staff writes competition_results" on public.competition_results for insert with check (public.is_staff());
create policy "staff updates competition_results" on public.competition_results for update
  using (public.is_staff()) with check (public.is_staff());

-- ======================================================================
-- TOURNAMENTS
-- ======================================================================
create policy "read visible tournaments" on public.tournaments for select
  using (status not in ('draft') or public.is_staff());
create policy "staff writes tournaments" on public.tournaments for insert with check (public.is_staff());
create policy "staff updates tournaments" on public.tournaments for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes tournaments" on public.tournaments for delete using (public.is_staff());

create policy "read own tournament_participants" on public.tournament_participants for select
  using (student_id = auth.uid() or public.is_staff());
create policy "student registers for tournament" on public.tournament_participants for insert
  with check (student_id = auth.uid());
-- Elimination / seeding is staff-only: no student UPDATE policy exists.
create policy "staff updates tournament_participants" on public.tournament_participants for update
  using (public.is_staff()) with check (public.is_staff());
create policy "student withdraws from tournament" on public.tournament_participants for delete
  using (student_id = auth.uid() or public.is_staff());

create policy "read tournament_rounds" on public.tournament_rounds for select using (true);
create policy "staff writes tournament_rounds" on public.tournament_rounds for insert with check (public.is_staff());
create policy "staff updates tournament_rounds" on public.tournament_rounds for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes tournament_rounds" on public.tournament_rounds for delete using (public.is_staff());

create policy "read tournament_matches" on public.tournament_matches for select using (true);
create policy "staff writes tournament_matches" on public.tournament_matches for insert with check (public.is_staff());
create policy "staff updates tournament_matches" on public.tournament_matches for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes tournament_matches" on public.tournament_matches for delete using (public.is_staff());

create policy "staff only tournament_match_questions" on public.tournament_match_questions for select using (public.is_staff());
create policy "staff writes tournament_match_questions" on public.tournament_match_questions for insert with check (public.is_staff());
create policy "staff deletes tournament_match_questions" on public.tournament_match_questions for delete using (public.is_staff());

create policy "read own published tournament_results" on public.tournament_results for select
  using ((published and student_id = auth.uid()) or public.is_staff());
create policy "staff writes tournament_results" on public.tournament_results for insert with check (public.is_staff());
create policy "staff updates tournament_results" on public.tournament_results for update
  using (public.is_staff()) with check (public.is_staff());

-- ======================================================================
-- LEADERBOARDS, NOTIFICATIONS, ANNOUNCEMENTS, FILES
-- ======================================================================
-- leaderboards are inherently public-within-scope by design (the point of
-- a leaderboard is to see your rank among peers), so any authenticated
-- user may read the whole table; the application layer is responsible for
-- querying the right `scope`/`scope_ref_id` slice. Write access is
-- staff-only (in later phases, a scheduled/event-driven function).
create policy "read leaderboards" on public.leaderboards for select using (true);
create policy "staff writes leaderboards" on public.leaderboards for insert with check (public.is_staff());
create policy "staff updates leaderboards" on public.leaderboards for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes leaderboards" on public.leaderboards for delete using (public.is_staff());

-- announcements: published-only for non-staff. NOTE (known simplification,
-- documented in docs/database-architecture.md): fine-grained audience
-- matching (institution/faculty/department/.../competition participants)
-- is enforced by the application query layer in this phase, not by RLS —
-- an announcement is not private data, so a student seeing one addressed
-- to a different department is a relevance bug, not a security breach.
-- The status gate below (draft/review content never leaking) is the part
-- RLS treats as security-relevant.
create policy "read published announcements" on public.announcements for select
  using (status = 'published' or public.is_staff());
create policy "staff writes announcements" on public.announcements for insert with check (public.is_staff());
create policy "staff updates announcements" on public.announcements for update
  using (public.is_staff()) with check (public.is_staff());
create policy "staff deletes announcements" on public.announcements for delete using (public.is_staff());

-- notifications: strictly private, per-student. Students never insert
-- their own (that would let them fabricate fake achievement/result
-- notifications) — only staff or a future server-side event trigger does.
create policy "read own notifications" on public.notifications for select
  using (student_id = auth.uid());
create policy "student marks own notification read" on public.notifications for update
  using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "staff sends notifications" on public.notifications for insert with check (public.is_staff());
create policy "student deletes own notification" on public.notifications for delete
  using (student_id = auth.uid());

create policy "own notification_preferences" on public.notification_preferences for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- files: a private file is visible only to its uploader and staff; a
-- public file (course material, avatar) is visible to anyone authenticated.
create policy "read accessible files" on public.files for select
  using (visibility = 'public' or uploaded_by = auth.uid() or public.is_staff());
create policy "user uploads own file" on public.files for insert
  with check (uploaded_by = auth.uid());
create policy "owner or staff updates file" on public.files for update
  using (uploaded_by = auth.uid() or public.is_staff())
  with check (uploaded_by = auth.uid() or public.is_staff());
create policy "owner or staff deletes file" on public.files for delete
  using (uploaded_by = auth.uid() or public.is_staff());

-- ======================================================================
-- AUDIT LOGS & PLATFORM SETTINGS
-- ======================================================================
-- admin_audit_logs: append-only. Staff may read and insert; nobody
-- (staff included) may UPDATE or DELETE a row through the client API —
-- the absence of those policies is the control.
create policy "staff reads audit logs" on public.admin_audit_logs for select using (public.is_staff());
create policy "staff writes audit logs" on public.admin_audit_logs for insert with check (public.is_staff());

-- platform_settings: readable by any authenticated user (support email,
-- maintenance banner, feature flags need to reach the whole app), but
-- only super_admin/admin may change platform-wide configuration.
create policy "read platform_settings" on public.platform_settings for select using (true);
create policy "admin writes platform_settings" on public.platform_settings for insert with check (public.is_admin());
create policy "admin updates platform_settings" on public.platform_settings for update
  using (public.is_admin()) with check (public.is_admin());
create policy "admin deletes platform_settings" on public.platform_settings for delete using (public.is_admin());
