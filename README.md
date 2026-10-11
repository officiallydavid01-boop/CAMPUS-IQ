# CampusIQ

**Learn. Practice. Level Up.**

CampusIQ is a university academic operating system: a student app
(courses, practice, exams, gamification, competitions, tournaments) and
an Admin Control Center, built on React + TypeScript + Vite + Supabase.

This repository contains the CampusIQ Phase 1–7 feature implementation and is now in **Phase 8: Integration & System Validation**. The source includes student learning, academic administration, exams/practice, gamification, competitions, team tournaments, notifications, and the weekly-challenge scheduler. It is **not yet production-certified**: the dependency-backed build and live Supabase migration/RLS/browser integration still need to pass.

## Current delivery roadmap

| Phase | Scope | Status |
|---|---|---|
| 1–7 | Product foundation, academic CMS, learning, assessments, gamification, competitions and tournaments | Implemented in source; live integration remains unverified |
| 8 | Integration & system validation: dependency-backed build, migration execution, Supabase auth/RLS/RPC checks, feature workflows | In progress |
| 9 | Full QA & launch readiness: mobile/desktop journeys, accessibility, security, PWA, performance and bug fixes | Pending Phase 8 gates |
| 10 | Deployment & launch: production configuration, GitHub/Vercel deployment, domain, smoke tests and operations | Pending Phase 9 gates |

The current test suite contains dependency-free regression checks. These verify source contracts, not successful SQL execution against PostgreSQL. See [`docs/phase8-integration-validation.md`](docs/phase8-integration-validation.md) for the current evidence, known blockers and safe test-project workflow.

For the next step, follow [`docs/preview-deployment.md`](docs/preview-deployment.md) to push the source to GitHub and deploy a **Vercel preview** with the connected Supabase project. The preview is intended for controlled live testing, not a claim of production certification.

Every route in the Master Specification exists in the router
(`src/App.tsx`) right now. Routes without a built feature render an
honest `ComingSoonPage` naming the phase that builds them — never fake
data or a dead button pretending to work.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, `react-router-dom`
  (HashRouter, for GitHub Pages compatibility), Zustand available for
  future global state, `lucide-react` icons.
- **Backend**: Supabase (Postgres, Auth, Storage, RLS, RPCs, and a weekly-challenge scheduler Edge Function that must be deployed separately).
- **Design system**: "Midnight Aurora" — see `src/styles/tokens.css` for
  every color/spacing/radius/shadow token, and
  `src/components/branding/HolographicBrain.tsx` for the brand mark.

See [`docs/database-architecture.md`](docs/database-architecture.md) for
the full schema/RLS/security write-up — read that before touching the
database in a later phase.

## Project structure

```
public/                 static assets, PWA manifest/icons, service worker
src/
  app/                  router, providers (auth), env config, error boundary
  components/           ui/ (Button, Input, Modal, Toast, ...), branding/,
                         navigation/ (StudentShell, AdminShell), feedback/
  features/             feature-specific composed components (e.g. academic/)
  pages/                one folder per route area
  services/             all Supabase access — components never call
                         supabase.* directly
  hooks/, types/, utils/, styles/
supabase/
  migrations/           001-039, ordered, see integration docs
  functions/            weekly-challenge-scheduler Edge Function
  seed/                 README only; seed SQL is in migrations/014
docs/                   database-architecture.md
tests/                  dependency-free Phase 5–6 security regression checks
```

## Local development

```bash
npm install
cp .env.example .env      # fill in the Supabase project URL + publishable key
npm run preflight         # dependency-free static integration checks
npm test                  # regression tests
npm run dev
```

The `.env.example` file contains placeholders only. Use the Supabase **publishable** key in `VITE_SUPABASE_PUBLISHABLE_KEY`; never put a service-role/secret key in a `VITE_*` variable or browser source. Use a disposable Supabase project for migration and RLS testing before considering production changes.

Requires Node 20+.

## Environment variables

See `.env.example`. Only the **publishable** Supabase key ever goes in a
`VITE_`-prefixed variable — never the `service_role` key or a database
password. Anything requiring elevated privilege is a Supabase Edge
Function (Phase 5+), not a frontend env var.

## Supabase setup

1. Create a Supabase account and a new project.
2. Copy the project URL and publishable key into `.env` (see above).
3. Apply the migrations, in order, via the Supabase CLI:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   or paste each file in `supabase/migrations/`, **in numeric order**,
   into the Supabase SQL editor if you're not using the CLI.
4. `014_seed.sql` inserts the real catalogue data (roles, permissions,
   level config, default platform settings, starter achievements) *and*
   clearly-labeled `[DEMO]` academic data (a fictional university/
   programme/courses) so the app has something to show immediately. Skip
   or delete the `DO $$ ... $$` demo block at the bottom of that file
   before applying it to a production project.
5. Storage buckets (`avatars`, `materials`, `banners`) are created
   automatically by migration `015_storage_buckets.sql` — applying the
   migrations (step 3) is all that's needed; there's no separate manual
   bucket-creation step. See `docs/database-architecture.md`
   "Storage model" for what each bucket allows.
6. Bootstrap your Super Admin — see
   `docs/database-architecture.md` "Bootstrapping the first super_admin."
   This is a manual SQL-editor step by design; it cannot be done through
   the app itself.

## Database migrations

The canonical migration sequence is **every numbered file from `001` through `039`, in numeric order**. Migrations `001`–`027` establish the schema and Phases 1–7; `028`–`039` add post-install security, access-control, and performance hardening. Do not skip the final hardening migrations on a fresh installation. For the already-connected CampusIQ project, all 39 migrations are recorded, so do not reapply them. Full rationale for every table and policy: [`docs/database-architecture.md`](docs/database-architecture.md).

## Phase 5 hardening pass

Migration `017_phase5_exam_hardening.sql` closes the direct answer-evaluator permission gap, verifies selected options belong to the question being graded, adds server-side exam-attempt creation/limit enforcement, validates exam answer writes against the attempt and deadline, and provides an atomic retry-safe submit-and-grade RPC. Exam-taking uses a countdown derived from the server-created attempt timestamp. Structured responses remain pending until an Admin marks them in `/admin/exams/review`; the score denominator comes from the exam question blueprint. Mixed-topic and weak-topic practice modes are available in addition to topic practice.

Migration `018_phase5_admin_exam_workflow.sql` adds transactional Admin exam creation/editing, validates that selected questions are published and belong to the offered course, and prevents changes to exam configuration after attempts exist so historical scores retain their original meaning. Admin can set difficulty, attempt limits, and availability windows. Migration `019_phase5_exam_question_access.sql` tightens access to published exam-question links to staff and students enrolled in the matching course offering. Past-question management supports editing records and managing MCQ options. Student past-question filters include session/year, semester, topic, and exam type. Results include time taken, correct/incorrect counts, topic breakdown, and stored XP-award value.

For a fresh environment, apply migrations 001–039 in numeric order after reviewing the target project history. Migrations 017–027 cover Phase 5–7 hardening and competition features; 028–031 add post-install question-view hardening, anonymous role-helper restrictions, and the `pg_trgm` schema move; 032 indexes uncovered foreign keys; 033 blocks team-match question retrieval after a match is completed or cancelled; 034 applies the same match-status and deadline guard to team-match answer reads and writes; 035 hoists auth.uid() calls in public RLS policies to reduce per-row evaluation overhead; 036 removes non-RLS-sensitive browser privileges and changes future table defaults to SELECT-only; 037 revokes anonymous direct table/sequence writes; 038 makes official attempt, answer, score, role, and gamification records writable only through validated RPCs; 039 makes future public-schema functions non-executable by browser roles unless explicitly granted and removes future sequence privileges. The connected CampusIQ project already has migrations 001–039; do not reapply them there. See `docs/live-supabase-installation-notes.md` and `docs/phase8-integration-validation.md`.

## Gamification & rewards (Phase 6)

Migration `020_phase6_gamification_engine.sql` introduces the server-verified activity ledger, idempotent XP awards, configurable activity rewards, level threshold validation/recalculation, daily/weekly quest progress, streak updates, and condition-based achievement unlocks. Student lesson completion now goes through `complete_lesson`, which validates a published lesson and an active enrollment; direct student writes to `lesson_progress` are removed so a browser request cannot manufacture completion timestamps. Practice-session and graded-exam rewards are awarded only after their authoritative records exist. Exam and practice rows receive their stored XP reward for result/history display.

Student routes `/dashboard`, `/profile`, and `/achievements` display persisted XP, level progress, streaks, quest progress, XP history, and the achievement catalogue. Admin routes `/admin/xp`, `/admin/quests`, and `/admin/achievements` manage level thresholds, activity reward values, quests, and supported achievement conditions. XP transactions are append-only and protected by a unique event/source key; students cannot supply their own XP amount or student ID to the award RPC. Custom achievement conditions are limited to the condition types shown in the Admin form; manual/future-phase conditions are not auto-awarded yet.

**Important:** this is source implementation, not live-database certification. Apply migration 020 after 001–019 and run the app against a real Supabase project before relying on XP/streak/quest behavior. UTC day/week boundaries currently define streak and quest resets. Streak recovery/grace tokens are not implemented because no recovery policy is defined in the existing schema.

## RLS

RLS is enabled on every table (verified — see "What has and has not been
verified" below). Full policy-by-policy reasoning lives as comments in
`supabase/migrations/012_rls.sql`, summarized in
`docs/database-architecture.md`.

## Authentication

Supabase Auth (email/password). `src/services/auth/authService.ts` is the
only file that calls `supabase.auth.*`. `AuthProvider`
(`src/app/providers/AuthProvider.tsx`) exposes the session and role flags
app-wide via `useAuth()`. Registration, login, logout, password reset,
and session persistence are all implemented and route through real
Supabase calls — there is no mock auth path.

## Admin architecture

`AdminRoute` + `AdminShell` gate and lay out `/admin/*`. The Admin
dashboard (`/admin`) shows real, live-queried counts (Master Spec section
22: "do NOT use fake numbers").

**Phase 3 adds real, working CRUD** for the entire academic hierarchy and
courses — not placeholders:

- `/admin/institutions`, `/admin/faculties`, `/admin/departments`,
  `/admin/programmes`, `/admin/levels`: create, edit, archive/restore,
  each cascading from its parent (pick an Institution to see/manage its
  Faculties, and so on) — the same cascade pattern as onboarding, reused
  via the shared `Select`/`DataTable` primitives rather than duplicated.
- `/admin/sessions`, `/admin/semesters`: create/edit academic sessions and
  semesters under an institution.
- `/admin/courses`: course *identity* CRUD (code, title, credit units,
  type, publish status).
- `/admin/course-offerings`: the page that directly implements the
  "level + semester specific course assignment" requirement — filter by
  any combination of Institution/Faculty/Department/Programme/Level/
  Session/Semester/Status, and create an offering that pins one Course to
  one exact Programme + Level + Semester. This is the write side of the
  same `course_offerings` table `getCourseOfferingsForContext`
  (student-facing) reads.

Every mutation above calls `services/audit/auditService.ts`, which writes
a real row to `admin_audit_logs` (action, entity type/id, actor,
metadata) — Master Spec section 72's audit trail, actually wired up, not
just schema.

Topics, Lessons, Materials, Questions, Exams, Competitions, Tournaments,
Users, Announcements, Files, Achievements, Quests, XP config,
Leaderboards, Audit log viewer, and Platform settings still render
`ComingSoonPage` — see the phase table above for when each lands. See
"Why routes are not the security boundary" in
`docs/database-architecture.md` — the real enforcement is RLS,
independent of whether a CRUD UI exists yet for a given table.

## Student learning (Phase 4)

Real, database-backed, not placeholder:

- **`/courses`**: exactly the "student course filtering" query — live
  `getCourseOfferingsForContext(profile's current institution/programme/
  level/semester)`, no hardcoded list. Enroll button writes a real
  `course_enrollments` row.
- **`/courses/:id`**: a specific enrolled offering's Topics (fetched via
  the offering's `course_id`, since Topics/Lessons attach to the reusable
  Course — see the design note in `004_academic_structure.sql`), each
  showing a completed/total lesson count.
- **`/courses/:id/topics/:topicId`**: that topic's Lessons, with a
  completed/incomplete indicator per lesson.
- **`/lessons/:id`**: full lesson content (introduction, objectives, core
  concept, explanation, examples, formulas, key points, notes),
  Previous/Next navigation computed from the lesson's own `topic_id` +
  `display_order` (works even reached via a bookmark, not just by
  clicking through from the topic page), a Materials list with real
  Supabase Storage signed-URL downloads, and a "Mark complete" action.
- **Dashboard**: shows real enrolled courses via the same service the
  Courses page uses — no separate/fake "recent activity" data.
- **`services/learning/progressService.ts`**: requests lesson completion
  through the `complete_lesson` database RPC, which validates publication
  and enrollment, recomputes the parent `topic_progress` rollup, and then
  calls the idempotent Phase 6 activity award RPC. Students cannot write
  completion timestamps directly.
- **Admin**: `/admin/topics`, `/admin/lessons`, and `/admin/materials` are
  all real CRUD now. `/admin/materials` (completed in a follow-up pass)
  cascades Institution → Faculty → Department → Course → Topic → Lesson,
  then lets staff pick a real file, which uploads to a genuine Supabase
  Storage bucket (`materials`, created by migration
  `015_storage_buckets.sql` — buckets are just rows in `storage.buckets`,
  so this is a real migration, not a manual dashboard step) and creates
  the `files` + `materials` rows pointing at it. Download uses a signed
  URL; the underlying Storage object's own RLS policy (also in migration
  015) only allows a student to read it once the parent `materials` row
  is published — the same publishing gate as the row itself, mirrored
  onto the object so a signed URL can't be produced for draft content by
  guessing a storage path.

**RLS hardening this phase:** `lesson_progress`'s INSERT policy now
requires `xp_awarded = false` (previously only checked ownership) — a
small gap closed before any client code could actually write to that
table for the first time. See `012_rls.sql`. Migration `015` similarly
mirrors the `materials` table's publishing-gate logic onto
`storage.objects`, and a second pass on `adminContentService.ts` added a
missing cleanup path (an uploaded file whose subsequent `materials` row
insert fails no longer leaves an orphaned Storage object).

## Practice, exams & analytics (Phase 5)

The grading engine is database-backed across migrations `016_grading_functions.sql`,
`017_phase5_exam_hardening.sql`, and `018_phase5_admin_exam_workflow.sql`:

- **`evaluate_answer()`** — one shared function both mechanisms below
  call, so "is this answer correct" is defined exactly once (MCQ/true-
  false against `question_options.is_correct`, numerical/short-answer
  against a trimmed case-insensitive text match, structured questions
  return null — not auto-gradable and routed to Admin manual review).
- **Practice grading** is an `AFTER INSERT` trigger on `practice_answers`
  — deliberately *after*, not *before*: RLS's `WITH CHECK` for that
  INSERT is evaluated against the row post-BEFORE-triggers, so a BEFORE
  trigger setting `is_correct` would collide with the student's own
  "is_correct must start null" policy and get the insert rejected. AFTER
  sidesteps this — the original insert already satisfied RLS, and the
  trigger's own UPDATE runs under its SECURITY DEFINER privilege
  (bypassing RLS the same way `recalculate_user_xp()` does in migration
  007). Worth reading the migration's own header comment if you touch
  this.
- **Exam grading** uses the atomic `submit_exam_attempt` RPC. The server
  checks ownership, active enrollment, exam availability, time limits, and
  attempt limits; the browser countdown is only a convenience layered over
  server-side deadline enforcement. Correct answers remain hidden until the
  attempt is graded.
- **`get_question_explanation`** and **`get_graded_attempt_correct_answers`**
  close a gap the Phase 2 docs left open: `questions_public` deliberately
  omits `explanation` (it usually gives away the answer, which is fine
  for practice but not for a live exam question), so instead of loosening
  that view, these two RPCs gate on "have you actually already answered
  this" / "is this attempt graded" — real security decisions, not blanket
  visibility.

**Admin**: `/admin/questions` (question bank, with a dynamic options
editor for multiple-choice/true-false and a plain correct-answer field
for numerical/short-answer), `/admin/past-questions`, and `/admin/exams`
(pick published questions from the bank, attach them to a Course
Offering) are all real CRUD.

**Student**: `/practice` offers topic, mixed-topic, and weak-topic modes;
sessions and answers write through validating RPCs. `/exams` → `/exams/:id`
uses a persistent countdown, server-validated answer saving, attempt limits,
and atomic submission. `/results/:id` distinguishes pending structured
responses from graded answers and shows explanations after grading.
`/past-questions` browses published historical study material. `/analytics`
reports real practice accuracy, topic strengths/weaknesses, tracked study
minutes, a seven-day practice activity view, and exam history.

## PWA

`public/manifest.webmanifest` + `public/sw.js` + `public/offline.html`
are real and functional, with one honest limitation: the service worker
caches the static app shell only, not Supabase data — see the comment at
the top of `public/sw.js`. Icons are SVG (see "Known limitations" below).

## Low-data mode

Not implemented yet (Phase 10). The CSS respects
`prefers-reduced-motion` throughout as a first step.

## Accessibility

Semantic HTML, visible focus rings (`:focus-visible` in
`globals.css`), labeled form fields (`Input`/`Select` require a `label`
prop), accessible modal (focus trap + Escape + restore focus in
`Modal.tsx`), `aria-live` regions for toasts and loading states,
`prefers-reduced-motion` support. Not yet audited with a screen reader or
automated tool (e.g. axe) — that's a Phase 11 deliverable.

## Testing

See [`tests/README.md`](tests/README.md). No test framework is wired up
yet — see "What has and has not been verified" for what *was* checked.

## Future phases

See the table above and the phase-by-phase description embedded as
comments throughout the migrations and services. Each phase's own
deliverable prompt should reference this README and
`docs/database-architecture.md` as its starting context, per the
"future-phase compatibility" requirement this was built under.

## Security

- No secret/service-role key anywhere in this repo; `.env.example`
  contains only placeholders.
- `.gitignore` excludes `.env`, build output, and Supabase local branches.
- Every table has RLS; every sensitive write path (XP, grading, results,
  role grants) is restricted beyond simple ownership — see
  `docs/database-architecture.md`.
- The Super Admin bootstrap is a manual SQL step, never a client-checkable
  email comparison.

## What has and has not been verified

This project has been inspected against the connected CampusIQ Supabase
project and hardened in an environment without a working dependency-install
path. Live schema and privilege metadata were checked, but frontend packages
could not be installed and real-account/browser end-to-end tests have not yet
run. The checks below distinguish static source checks from tests that still
need a real app and database runtime:

**Actually checked, in this environment:**
- Every `.json`/`tsconfig`/manifest file parses as valid JSON.
- Every `@/...` import across every `.ts`/`.tsx` file resolves to a real
  file on disk (scripted check, 465 imports across 90 files, zero
  unresolved).
- Every SQL migration file has balanced parentheses (a scripted
  approximate syntax check — not a real Postgres parse).
- Every table created in migrations `003`–`011` has at least one RLS
  policy in `012` (scripted diff, zero gaps).
- Manual review of every migration and every RLS policy for logical
  consistency (FK targets exist, enum values match across files, naming
  consistency).
- Every Supabase `.from("table")` call site checked against the
  hand-written `Database` type's declared tables (caught and fixed one
  real gap — `user_roles` — during Phase 3).
- A heuristic unused-import scan across every `.ts`/`.tsx` file.
- Manual review of every optional-chaining expression added in Phase 3's
  `DataTable` component for correct short-circuit propagation.
- Phase 4: found and fixed a real UX bug (Academic Profile's "Change
  Academic Context" never passed the student's existing selections into
  the form, forcing a full re-pick every time) and a real RLS gap
  (`lesson_progress` INSERT didn't constrain `xp_awarded`) before either
  could reach a live project.
- Phase 5–8: 70 dependency-free Node regression checks pass (`npm test`).
  They inspect migration/service contracts and type-map coverage; they are not
  a substitute for running PostgreSQL integration tests.
- Phase 5 hardening: 106 `.ts`/`.tsx` files were syntax-transpiled with the
  installed TypeScript compiler with zero syntax diagnostics.

**Still open — these are the live-preview gates, not reasons to keep delaying a preview deployment:**
- `npm install --ignore-scripts --no-audit --no-fund` was retried during the latest pass but timed out in this environment. No dependency tree or package lockfile was produced. The Vite config now declares the missing `@types/node` dependency and uses an ESM-safe project-root path; the real dependency-backed build must still be confirmed by Vercel/CI.
- `npm run build`, `npm run lint`, and the now-correct project-reference
  `npm run typecheck` could not pass because dependencies could not be installed.
  The typecheck command was corrected from a no-op `tsc --noEmit` invocation to
  `tsc -b --force --pretty false`; the resulting unresolved React/Supabase/Vite
  module diagnostics are environmental, not a successful typecheck.
- The connected Supabase project has migrations 001–039 recorded, and live
  metadata spot checks confirmed 78/78 public tables have RLS enabled, zero
  public SECURITY DEFINER functions are executable by `anon`, and all 94
  SECURITY DEFINER functions have a fixed search path. The 63 authenticated-
  callable SECURITY DEFINER notices remain as intentional-RPC advisor warnings;
  they are documented in `docs/security-definer-review.md` and must not be
  globally revoked without replacing the RPC paths. Real-account authorization
  tests are still required before production use.
- No RLS policy has been exercised through the app with real student/staff/Admin sessions.
- The PWA (installability, offline fallback) has not been tested in an
  actual browser/device.
- Nothing has been deployed anywhere. Nothing has connected to any real
  GitHub or Supabase account.

## Known limitations (carried into later phases)

- **PWA icons are SVG, not PNG.** iOS Safari's PWA icon support for SVG
  is inconsistent; generate PNG rasters (192×192, 512×512, and a
  maskable 512×512) from `public/icons/icon.svg` before shipping, and
  update `manifest.webmanifest` accordingly.
- **`courses.course_code` is globally unique**, not scoped per
  institution. Fine for a single-institution deployment; if/when CampusIQ
  actually serves multiple institutions with overlapping course codes
  (Master Spec section 100: multi-institution future scalability), this
  needs to become a composite uniqueness rule.
- **Practice/exam RPCs must be applied together with migrations 017, 018, and 019.** The
  student services now use the validating write functions rather than direct
  table writes. Do not deploy the frontend against a database that has only
  migrations 001–016, because the newer RPC names will not exist.
- **Announcement audience targeting** is enforced by the application
  query layer, not RLS, in this phase — see
  `docs/database-architecture.md` "RLS model" point 4.
- **Auto-enrollment on academic-context change** is not implemented — see
  "Current context vs. academic history" in
  `docs/database-architecture.md`.
- **No bulk/CSV import for academic data yet** (Master Spec section 73) —
  Phase 3's Admin CRUD is single-row create/edit only. Bulk import with
  validation/duplicate-detection/preview is left for whenever real
  institution data volume makes it worth building.
- **Course pages still show completion counts rather than a course-specific
  gamification breakdown.** Overall XP, level, streak, quest, and achievement
  summaries are available from the dashboard/profile routes.
- **Notes, Bookmarks, and Planner have no pages yet** — their tables and
  full self-service RLS have existed since Phase 2, but no UI was built
  for them in Phase 4 or 5; they're simple, low-risk CRUD whenever
  there's room for them, not blocked on anything.
- **Structured answer marks are binary in V1** — Admin can mark a response
  correct or incorrect, but partial-credit rubrics and per-part scoring are
  not implemented. Structured responses in mock exams remain pending until
  an Admin reviews them at `/admin/exams/review`.
- **Materials admin UI only covers lesson-attached materials** — the
  schema also allows a material to attach directly to a `course_offering`
  (a semester-specific handout with no single lesson home), but
  `AdminMaterialsPage` doesn't yet have a path for that variant. No
  file-type/size validation is enforced client-side either (Master Spec
  section 97) — Supabase Storage's own per-bucket limits are the only
  current guard.
- **Course offering and institution/faculty/department/programme/level
  archiving uses soft `is_active`/`status` flags, never DELETE** — by
  design (Master Spec section 98), but note the Admin CMS does not yet
  surface a "show archived" toggle on every list; `AdminInstitutionsPage`
  does, the deeper hierarchy pages currently only list active parents in
  their cascading selectors (an archived Faculty won't appear as a
  parent option for picking Departments, for instance) — worth revisiting
  once real archival workflows are used in anger.

## Support

- Email: officiallydavid01@gmail.com
- WhatsApp: 09126122448

(Also reachable in-app at `/support` and Settings.)
