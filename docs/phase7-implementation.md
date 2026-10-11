# Phase 7 Implementation Notes

## Added in this source package

- Migrations `021_phase7_competition_engine.sql` through `027_phase7_team_tournament_and_notifications.sql`.
- Competition draft creation, question assignment and publication with frozen auto-gradeable question snapshots.
- Server-side competition registration, single attempt, answer persistence, grading, provisional result publication, 48-hour disputes, corrections, finalization and Phase 6 XP/achievement calls.
- Student competition hub/detail, countdown, attempt UI, published leaderboard, provisional-result dispute form, and team creation/invitation/acceptance UI.
- Weekly challenge series and idempotent occurrence generation operations. The Admin UI can generate the next occurrence manually.
- Team/department aggregation foundations and roster locking.
- Tournament creation/publication, deterministic match generation, individual match attempts, group-stage qualification, Admin result review, advancement, final standings and reward integration.
- Admin competition centre and tournament management screens.
- Static contract/regression tests in `tests/phase7-competition.test.mjs`.

## Apply migrations in order

Apply all existing migrations through `020_phase6_gamification_engine.sql`, then apply `021` through `027` in numeric order. Do not apply only the latest file. Review the migration plan against the current Supabase project before production application and back up production data first.

## Locked defaults enforced

- `participation_mode = 'scheduled_live'`
- `attempt_policy = 'single_scored'`
- Team default `top_n_aggregate`, configurable per competition
- `dispute_window_hours = 48`
- Tournament formats `single_elimination`, `round_robin`, `group_stage_knockout`

## Test evidence from this environment

- Node regression/static tests after the Phase 7 completion batch: **50 passed, 0 failed**.
- TypeScript/TSX syntax transpilation checks on the modified source files: **passed**.
- ZIP/archive integrity: checked when extracting the source archive.
- Full `tsc -b`, lint and production build: **not verified** because package dependencies could not be installed in this environment.
- SQL migration application, RLS tests against a real Postgres instance, and live Supabase/browser integration: **not run**. Static tests are not a substitute for these release gates.

## Known remaining integration work / limitations

1. Run a full dependency-backed TypeScript typecheck, lint and production build, then fix any project-level errors.
2. Apply migrations 021–027 to a disposable Supabase project and run real RLS/integration tests before applying to production. The migration SQL has not been executed by a PostgreSQL parser or database in this environment, so SQL syntax/runtime remains unverified until this step.
3. The competition Admin form supports institution, faculty, department, programme, level, session, semester and course-offering scopes. Tournament scopes currently support everyone, institution, faculty, department, programme and level. Verify the selectors against the live academic data and role policies.
4. Weekly series occurrences can be generated idempotently from the Admin interface; a trusted scheduled job/Edge Function must be configured for unattended recurring generation.
5. In-app notification triggers now cover tournament/competition status, result publication/correction, team invitations, team match completion, and achievement unlocks. External email/push/WhatsApp delivery is not enabled and needs separate providers.
6. Student-facing team tournament registration and match attempts are now implemented in source. The database migration is unexecuted, so the flow must not be enabled for real students until its team roster, scoring, group qualification, result finalization and XP paths pass live integration tests.
7. Structured/manual-mark question types are rejected for auto-graded competitions and tournament matches. Only supported auto-gradeable types can be published in those question sets.
8. A full browser end-to-end pass across student context changes, team invites, tournament byes, dispute corrections and XP reconciliation remains required.

## Safe next step

Use a disposable Supabase project, apply the migration sequence, seed two or more test students plus an Admin and academic hierarchy records, then test registration, one-attempt enforcement, question privacy, result publication, disputes, team roster locks, each tournament format and reward idempotency. Do not enable live competitions for real students until the release gate is green.

## Phase 7 follow-up batch: unattended weekly scheduling

Migration `026_phase7_weekly_scheduler.sql` adds a trusted service-role-only scheduler
RPC. It creates two upcoming weekly occurrences for each active series, calculates
scheduled starts using the series' IANA timezone and local weekday/time, uses local
calendar dates as idempotency keys, and keeps the ordinary authenticated-admin guard
on manual generation. `supabase/functions/weekly-challenge-scheduler/index.ts` wraps
the RPC and requires a separate `CAMPUSIQ_SCHEDULER_SECRET` bearer token.

This closes the code gap for automatic recurring generation, but **does not activate
it automatically**. The migration and Edge Function still need to be deployed to a
test Supabase project, then a Cron/external schedule configured and verified. Read
`supabase/functions/README.md` before setup. No real Supabase database execution was
available during this implementation pass.

## Phase 7 completion batch: team tournaments and in-app notifications

Migration `027_phase7_team_tournament_and_notifications.sql` adds a separate participant mode (`individual` or `team`) to tournaments and requires a linked team competition for team tournaments. It adds team registration records, roster-lock and academic-scope validation, one-team-per-student enforcement, team match attempts/answers, server-side grading, configurable top-N aggregate scoring, group qualification, advancement, and a team-aware final standings/reward RPC. The Admin tournament form can create individual or team tournaments and selects the linked team competition. Students can register an eligible locked-roster team and take the team's scheduled match attempt through the same match route.

The same migration adds preference-aware in-app notifications for tournament status changes, competition status changes, competition result publication/correction, team invitations, team match completion, and achievement unlocks. The student app now has a Notifications screen and navigation entry. This does **not** enable email, browser push or WhatsApp delivery; those require separately configured providers and tested delivery flows.

### New Phase 7 completion checks

- `tests/phase7-completion.test.mjs` asserts the team tournament, notification, UI route, and migration contracts.
- Node regression/static suite after this batch: **50 passed, 0 failed**.
- TypeScript/TSX syntax transpilation checks: passed for all modified TS/TSX files.
- Full dependency-backed `tsc -b`, lint and Vite production build remain unverified because dependency installation timed out in this environment.
- Migration `027` has not been executed against PostgreSQL/Supabase, so its runtime SQL behavior, RLS interactions, trigger ordering, and tournament bracket edge cases still require a disposable Supabase integration pass. The contract tests are not SQL parser or database integration tests.

### Required pre-release integration cases

1. Apply migrations 001–027 in numeric order to a disposable Supabase project.
2. Create an active team competition, register two teams, invite/accept members, lock rosters, and link a team tournament to that competition.
3. Verify registration eligibility, one-team-per-student rules, roster locking, academic scope, and capacity.
4. Exercise individual and team tournaments in single elimination, round-robin and group-stage + knockout formats, including odd-sized brackets, byes, draws in group/round-robin play, knockout ties, late submissions, and missing team members.
5. Verify team top-N scoring, advancement, final standings, XP idempotency, achievement unlocks and notifications against real database state.
6. Test RLS using student A, student B, team captain, content staff, Admin and Super Admin accounts. Confirm one student cannot read another student's answers or notifications.
7. Run dependency-backed typecheck, lint, production build and browser tests before production migration/deployment.
