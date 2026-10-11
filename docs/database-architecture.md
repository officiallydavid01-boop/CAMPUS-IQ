# CampusIQ database architecture

This document explains the schema and security model built in
`supabase/migrations/001` through `014`. It's written for whoever picks up
Phase 3 onward — read this before adding tables, not just the SQL itself.

## Entity relationships

```
institutions
  └─ faculties
       └─ departments
            └─ programmes
                 └─ levels

institutions
  └─ academic_sessions
       └─ semesters

courses (reusable identity)
  └─ course_topics
       └─ lessons
            └─ lesson_progress (per student)
       └─ topic_progress (per student)

course_offerings (course × institution × programme × level × semester)
  └─ course_enrollments (per student)
  └─ exams
       └─ exam_questions ── questions ── question_options
       └─ exam_attempts ── exam_answers

questions ── practice_sessions ── practice_answers
questions ── competition_questions ── competitions
questions ── tournament_match_questions ── tournament_matches ── tournament_rounds ── tournaments
```

Every table above is created in `004`–`011`; every one of them has an RLS
policy in `012` (there's a cross-check for this — see "RLS coverage" below).

## Role model

`roles` / `permissions` / `role_permissions` / `user_roles` (migration
`003`) implement a join-table role system rather than a single `role`
column on `profiles`, so:

- a user can hold more than one role,
- new roles/permissions can be added without touching `profiles`,
- and the question "does this user have role X" is answered by one
  function (`public.has_role`), never duplicated inline in a policy.

`is_super_admin()`, `is_admin()` and `is_staff()` build on `has_role()` and
are what every RLS policy in `012` actually calls. **Never** write a new
policy that re-derives role logic inline — call these functions, so a
future role-model change (e.g. adding a `finance_admin` role) is a
one-file change.

### Bootstrapping the first super_admin

The Master Specification is explicit: never authorize by checking
`email === 'officiallydavid01@gmail.com'` in code. Instead, after that
person has signed up normally (so a `profiles`/`auth.users` row exists),
run this once via the Supabase SQL editor (not from the app):

```sql
insert into public.user_roles (user_id, role_id)
select u.id, r.id
from auth.users u, public.roles r
where u.email = 'officiallydavid01@gmail.com'
  and r.name = 'super_admin';
```

There is deliberately no automated bootstrap script that does this from
client code — `user_roles` INSERT is `is_super_admin()`-only in RLS
(`012`), and the very first super_admin can't satisfy that check yet.
This manual step is the one intentional exception.

### Why routes are not the security boundary

`ProtectedRoute` / `AdminRoute` (`src/app/router/`) hide UI from the
wrong audience for UX reasons only. The actual security boundary is RLS:
every table a logged-in-but-wrong-role user could query is independently
protected, so manually navigating to `/admin` or calling `supabase.from(...)`
from devtools with a student session can never return more than a
student's own RLS policies allow — regardless of what the React app
believes about that user's role.

## Academic hierarchy, and the Course vs Course Offering split

`institutions → faculties → departments → programmes → levels`, plus the
orthogonal `academic_sessions → semesters`, model the parts of a
university that rarely change. `courses` is the *reusable* identity of a
course (e.g. "CSC101 — Introduction to Computer Science"); `course_offerings`
is that course being taught to a specific `programme` + `level` +
`semester` (which belongs to an `academic_session`) at a specific
`institution`.

**Design decision worth flagging explicitly:** the Master Specification's
prose says the course/offering split exists "to prevent unnecessary
duplication," but its own hierarchy diagram elsewhere nests Topics and
Lessons under Course *Offering*. Taken literally, that would mean
recreating every topic and lesson every time a course is re-offered next
semester — which reintroduces exactly the duplication the split was
meant to avoid. This schema resolves the tension in favor of the stated
goal: `course_topics` and `lessons` attach to the reusable `courses` row
(see `004_academic_structure.sql`), so content is authored once and
appears under every current and future offering of that course.
`materials` can attach to either a specific `lesson` or a specific
`course_offering` (or both), for delivery-specific handouts.

`course_offerings` has a named unique constraint,
`course_offerings_unique_context`, on
`(course_id, programme_id, level_id, semester_id)` — this is what allows
the same `course_id` (e.g. CSC101) to appear as more than one offering
(e.g. to Programme A and, separately, to Programme B, both at 100L/1st
Semester/2026-2027) without being treated as a duplicate.

### Level + semester specific course assignment

This is enforced at every layer, not just the frontend:

- **Schema**: `course_offerings` has non-null `institution_id`,
  `programme_id`, `level_id`, `semester_id` — a course offering cannot
  exist without all four.
- **Integrity trigger**: `validate_course_offering_context()` (`004`)
  rejects an INSERT/UPDATE where `programme_id`/`level_id`/`semester_id`
  don't actually chain up to the given `institution_id` — an Admin CMS
  bug can't silently save an inconsistent offering.
- **Query pattern**: the student's Courses page calls
  `coursesService.getCourseOfferingsForContext({ institutionId,
  programmeId, levelId, semesterId })`, which is a straight `WHERE`
  filter on `course_offerings` — no client-side filtering of an
  over-fetched list. `idx_course_offerings_student_context` (`013`)
  covers exactly this query.
- **RLS**: additionally guarantees a student only ever receives
  `status = 'published'` rows, regardless of what the query asks for.

### Current context vs. academic history

`profiles.institution_id` / `faculty_id` / `department_id` /
`programme_id` / `level_id` / `current_session_id` / `current_semester_id`
are the student's **current** academic context — mutable via Settings →
Academic Profile → "Change Academic Context"
(`src/pages/settings/AcademicProfilePage.tsx`, built on the same
`AcademicContextForm` onboarding uses). Changing these columns:

- is validated by `validate_profile_academic_context()` (`004`), which —
  like the course_offerings guard above — only checks a parent/child pair
  once *both* are non-null, so onboarding can fill the form field-by-field
  without tripping the guard, but a submitted combination that doesn't
  actually chain together is rejected by Postgres, not just the UI.
- never touches `course_enrollments`, `lesson_progress`,
  `topic_progress`, `exam_attempts`, `practice_sessions`, `notes`,
  `bookmarks`, or any other history table — those key off specific
  `course_offering_id` / `lesson_id` / etc. rows, not off "the student's
  current level," so a student's 100L/1st-Semester history is exactly as
  queryable after they move to 200L/1st-Semester as it was before.
- does **not** currently auto-create new `course_enrollments` rows for
  the new context's offerings. The Master Spec allows this ("the system
  may create or update... as appropriate") but leaves it optional; wiring
  it up is Phase 4 work, once the student Courses page itself exists to
  decide what "enrolled" should mean (implicit from viewing, or an
  explicit action).

## Publishing model

`content_status` (`draft | review | published | archived`) is used
uniformly across `courses`, `course_offerings`, `course_topics`,
`lessons`, `materials`, `questions`, `past_questions`, `exams`, and
`announcements`. The rule is the same everywhere: staff can read/write
every status; anyone else can only ever `SELECT` `status = 'published'`
rows. There's no separate "preview" mechanism yet — an Admin previewing
draft content today does so via the is_staff() SELECT policy, same as
editing it; a dedicated preview *mode* that renders draft content through
the student-facing UI is Phase 3/4 work.

## RLS model

Full policy-by-policy rationale lives as comments directly in
`012_rls.sql` — that file is the source of truth, not a duplicate summary
here. The cross-cutting principles:

1. **Default deny.** A table with no policy for an action means nobody
   can do that action via the client API. This is used deliberately for
   e.g. deleting `admin_audit_logs` rows, or updating `xp_transactions` —
   the absence of a policy *is* the control.
2. **WITH CHECK constrains earned values.** Anywhere a student can insert
   into a table with a server-computed column (`is_correct`, `score`,
   `xp_awarded`), the INSERT policy's `WITH CHECK` requires that column
   to be null/zero/unearned. Grading/awarding happens in a subsequent
   staff or (future) SECURITY DEFINER function UPDATE, which has its own,
   separate policy.
3. **Column-level secrecy via views, not table RLS.** RLS is row-level,
   not column-level, so it can't hide `question_options.is_correct` from
   an otherwise-visible row. Two views —
   `public.questions_public` and `public.question_options_public` — omit
   the sensitive columns and are owned by the migration role, so they can
   read the (staff-only-by-RLS) base tables regardless of the querying
   student's own permissions. **Resolved in Phase 5:** these views also
   omit `explanation` (it usually gives away the answer), and two RPCs —
   `get_question_explanation` and `get_graded_attempt_correct_answers`
   (migration `016`) — gate that reveal on "have you actually already
   answered this" / "is this attempt graded," rather than loosening the
   views themselves. See "Grading engine" below for the full mechanism,
   including `grade_exam_attempt` and the practice-grading trigger.
4. **A documented simplification on announcements**: `announcements`'
   `audience`/`audience_ref_id` targeting (institution-only, course-only,
   etc.) is NOT enforced by RLS in this phase — only the
   `status = 'published'` gate is. Seeing an announcement addressed to a
   different department is a relevance bug, not a privacy breach, so this
   was judged an acceptable Phase 9 (not Phase 2) refinement. If that
   judgment call doesn't match your risk tolerance, tighten it before
   going further.

### RLS coverage

Every table created by `003`–`011` has at least one policy in `012` —
verified by a script during authoring (diff every `create table` against
every `on public.<table>` in the RLS file). If you add a table in a later
migration, add its policies in the same migration (or a same-phase
follow-up) and re-run that check; don't let a new table go live without
RLS even temporarily.

## XP & grading security model

`xp_transactions` is an **append-only ledger** — no UPDATE/DELETE policy
exists for anyone, including staff. `user_xp` is a derived cache,
recomputed by the `recalculate_user_xp()` trigger every time a row is
appended to the ledger; there's no client-writable path to `user_xp` at
all.

**Important Postgres nuance for whoever builds the Phase 5/6/7 award
functions:** a `SECURITY DEFINER` function runs with the *privileges of
its owner*, and Postgres RLS does not restrict a table's owner by default
(unless `FORCE ROW LEVEL SECURITY` is set, which this schema does not
use). In a standard Supabase project, migrations run as a role that owns
these tables, so a `SECURITY DEFINER` function defined in a later
migration (e.g. "award XP for a graded exam") can `INSERT` into
`xp_transactions` even though the RLS policy visible to ordinary staff/
students only allows `source = 'admin_grant'`. This is intentional and is
*the* mechanism by which "lesson_completion", "practice_session", etc.
awards are meant to happen — but it's also why those functions must do
their own application-level checks (has this lesson already been
awarded? is this exam attempt actually graded?) since RLS is not doing
that work for them. `lesson_progress.xp_awarded` and the
`protect_lesson_progress_xp()` trigger are the one piece of this
anti-farming logic already built in Phase 2; the equivalent for exams/practice/quests is implemented in migration
`020_phase6_gamification_engine.sql`. The authenticated
`record_gamification_activity()` RPC validates source records, derives the
student from `auth.uid()`, and writes rewards to the append-only ledger.
Lesson completion now uses `complete_lesson()`; direct student inserts and
updates to `lesson_progress` are no longer allowed. Quest/achievement/streak
updates run through internal SECURITY DEFINER helpers whose execution is
revoked from browser roles. Static source tests are not a substitute for
applying these migrations and exercising RLS against a live Supabase project.

Anti-cheat for exams follows the same shape. After migration 017,
`exam_attempts` and `exam_answers` are read-only to browser roles at the
table-privilege level; students must use validating SECURITY DEFINER RPCs
to start, save, and submit. The functions derive the caller from `auth.uid()`,
check ownership/context/deadlines/attempt limits, and perform grading inside
the database transaction. Competition attempt writes will be hardened in the
competition phase before that feature is enabled.

## Grading engine (migrations 016–017, Phase 5)

Implements the exam/practice half of the anti-cheat shape described
above. `evaluate_answer(question_id, selected_option_id, answer_text)` is
the one function both mechanisms below call — multiple-choice/true-false
against `question_options.is_correct`, numerical/short-answer against a
trimmed, case-insensitive match on `questions.correct_answer_text`,
non-empty structured exam responses return `null` until an Admin marks them
through `/admin/exams/review`; unanswered questions count as incorrect.

**Practice** (`practice_answers`) grades via an `AFTER INSERT` trigger,
not `BEFORE INSERT`. RLS checks the initial row while `is_correct` is null;
the trigger then grades it in a separate UPDATE under `SECURITY DEFINER`.
Migration 017 routes session creation, answer submission, and session ending
through validating RPCs, and revokes direct browser INSERT/UPDATE/DELETE on
practice tables. The answer RPC checks ownership, course/topic scope, option
ownership, duplicate answers, and the weak-topic eligibility rule.

**Exams** (`exam_answers`/`exam_attempts`) use `start_exam_attempt`,
`save_exam_answer`, and `submit_exam_attempt`. The last function marks the
attempt submitted and calls the internal `grade_exam_attempt` in one
transaction. The internal grader is not directly executable by browser roles.
Attempt creation locks the exam row while enforcing active enrollment,
availability, and attempt limits. Answer saving locks the attempt and checks
deadline, exam membership, and option/question matching. A countdown in the
browser is UX only; server time remains authoritative. The grading denominator
comes from the exam blueprint, and non-empty structured responses stay in
`submitted` state until staff marks them through `mark_structured_exam_answer`.
The manual-review function recalculates the score and finalizes the attempt
when no pending structured answers remain.

`get_question_explanation(question_id)` and
`get_graded_attempt_correct_answers(attempt_id)` gate sensitive data rather
than exposing it through a public view. The explanation RPC returns `null`
until the student has answered the question (practice) or has a graded attempt
(exam). The correct-answer RPC verifies ownership and requires a graded attempt;
otherwise it raises an authorization/state exception.

## Student content authorization (migration 017)

Published course offerings are readable when they match the student's current academic context or the student already has an active/completed enrollment. Topics, lessons, materials, past questions, and exams require a relevant active/completed enrollment. The student-safe question/option views apply the same enrollment rule. Self-enrollment goes through `enroll_in_course_offering`, which validates the full current context and checks offering capacity while locking the offering row. Direct browser writes to `course_enrollments` are revoked; historical enrollments remain readable and are not deleted when academic context changes.

## Storage model

`files` (migration `010`) is metadata only — actual bytes live in
Supabase Storage buckets, not in Postgres. `visibility` (`public` |
`private`) plus `uploaded_by` drive the RLS policy on the metadata table.

**Correction from an earlier draft of this document:** Storage bucket
creation and object-level access policies turn out *not* to require a
manual dashboard step — a bucket is just a row in `storage.buckets`, and
`storage.objects` already has RLS enabled by Supabase itself, so both are
captured in migration `015_storage_buckets.sql` like any other table:

- **`avatars`** (public bucket) — anyone can read; a user may only
  write inside their own `{user_id}/` folder
  (`(storage.foldername(name))[1] = auth.uid()::text`).
- **`materials`** (private bucket) — staff-only write. A student may
  `SELECT` (and therefore generate a signed URL for) an object only if
  it's referenced by a `public.materials` row with `status = 'published'`
  — the same publishing gate the `materials` table itself enforces,
  mirrored onto the underlying object so a signed URL can't be produced
  for draft content by guessing/enumerating storage paths.
- **`banners`** (public bucket) — staff-only write, for competition/
  tournament/announcement images (not yet used by any Phase 1-4 feature).

Path convention (enforced by application code — `services/storage/storageService.ts`
— not the database): `materials/{lesson_id}/{timestamp}-{filename}`,
namespacing uploads by lesson so they can't collide and so "everything
for this lesson" needs no query to locate.

## Audit model

`admin_audit_logs` is append-only (no UPDATE/DELETE policy, same pattern
as `xp_transactions`). As of Phase 3 it is genuinely populated:
`src/services/audit/auditService.ts` exports `logAuditEvent(action,
entityType, entityId, metadata)`, which every Phase 3 Admin CRUD function
(`services/academic/academicService.ts`, `services/courses/adminCoursesService.ts`)
calls right after its mutation succeeds — not a generic row-trigger, by
design: some later actions (e.g. "tournament finalized") aren't a
single-row UPDATE and don't fit a trigger pattern well, so the explicit
call-it-yourself convention established in Phase 3 is what later phases
should keep following for their own Admin mutations, rather than
reaching for a trigger-based approach partway through.

## Competition & tournament models

Both follow the same shape: a top-level configuration row
(`competitions` / `tournaments`) with a `content_status`-like status enum
of its own (`competition_status` / `tournament_status`, since "Live" and
"Cancelled" aren't meaningful for a lesson but are for a competition),
participants, attempts/matches, answers, and a final authoritative
results table that's staff/function-write-only and student-readable only
once `published = true`.

Tournaments additionally have `tournament_rounds`, `tournament_matches`,
frozen per-match question snapshots, match attempts/answers, result records,
validated advancement, and final standings. Phase 7 extends the legacy format
enum with `single_elimination`, `round_robin`, and `group_stage_knockout` while
preserving the original values. The Admin tooling supports tournament drafts,
publication, match generation, result review, group qualification, status
transitions, and final standings. Team match scoring currently uses the Admin
result-review path; the self-serve match attempt engine is for individual
matches.
