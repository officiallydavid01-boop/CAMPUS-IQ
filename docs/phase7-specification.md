# CampusIQ Phase 7 Specification Contract

**Status:** Approved implementation contract  
**Scope:** Individual and team competitions, weekly challenges, department standings, tournaments, verified leaderboards, disputes, rewards and security.

## Locked defaults

1. Participation is **scheduled live only**. Flexible-window official competitions are out of scope for Phase 7.
2. Each student gets **one official scored attempt per competition**. Practice/preview, if later offered, must never affect official rankings.
3. Team scoring defaults to **configurable Top-N aggregate**. Sum, average and match-based scoring are supported where applicable.
4. The dispute window is **48 hours after provisional results are published**, using the server-recorded publication timestamp.
5. All three tournament formats are required: **single elimination, round-robin, and group stage followed by knockout**.

## Product scope

- Student competition hub, details, registration, scheduled attempt-taking, saved answers, submission, results and verified leaderboards.
- Weekly challenge series with separate occurrence records and idempotent occurrence generation.
- Teams, invitations, roster locking, Top-N aggregation and verified department aggregates.
- Admin competition centre for drafts, question selection, publication, provisional results, finalization, disputes and corrections.
- Tournament drafts, registration, rounds, match scheduling, all three formats, match attempts, result review, advancement, group qualification, final standings and rewards.
- Phase 6 XP/achievement integration, Supabase RLS, server-side authorization, audit history and regression coverage.

## Lifecycle and fairness rules

Competition lifecycle changes and publication must use validated database operations. Published competition settings, eligibility scopes, rules and question snapshots are immutable. Published questions must be auto-gradeable in Phase 7; structured/manual-mark questions are rejected at publication until a supported rubric workflow exists.

The server is authoritative for eligibility, registration, start and submission windows, scoring, accuracy, duration, ranks, tournament outcomes, advancement and rewards. Client-supplied scores, ranks, winners, timestamps or XP amounts are never authoritative. Retryable operations must be idempotent.

Provisional results become final only after the 48-hour dispute window closes and all disputes are resolved. Corrections preserve prior values, create a versioned correction record, and recalculate affected rankings. XP is granted from the Phase 6 ledger after finalization using a stable event key.

## Academic eligibility

Eligibility references the existing Admin-managed hierarchy: institution, faculty, department, programme, level, academic session, semester and course offering. Registration captures a snapshot of the student's current academic context so later profile changes do not rewrite historical eligibility.

## Database and backend

Migrations 021–025 extend, rather than replace, the Phase 1–6 schema. Existing competition, assessment, gamification, audit and academic records are reused. Student mutation of authoritative attempts, answers, results, tournament participation and match results is RPC-only. Security-definer functions use a pinned empty search path and explicit identity/role/ownership checks; exposed functions have explicit execute grants.

The logical model includes competition scopes and question snapshots, registrations/attempts/answers/results, weekly series/instances, teams/members/team and department aggregates, tournament rounds/matches/frozen match questions/match attempts/results, disputes and score corrections.

## UI contract

All student/Admin pages must use the existing Midnight Aurora design system, responsive layouts, accessible controls, clear timezones/countdowns, safe retry states, paginated rankings, and honest provisional/final labels. Admin publication must validate schedules, questions, rules, attempts, scoring, rewards, scopes and tournament format requirements.

## Acceptance and release gate

- Valid drafts publish and invalid drafts fail with useful errors.
- Registration and one-attempt constraints hold under concurrent requests and retries.
- No direct client write can forge score, rank, XP, winner, or result state.
- Frozen snapshots survive source-bank edits; question keys are not returned to students.
- Tie-breakers, Top-N aggregation, department standings, all tournament formats and advancement are deterministic.
- Dispute deadlines, correction history and reward reconciliation are enforced.
- RLS tests cover students, captains, Admins and unauthorized users.
- Existing Phases 1–6 regressions pass.
- Migrations apply to a clean test database, and a production build plus live Supabase/browser integration tests pass before production release.

## Dependencies

- Phases 1–2: design system, routes, Supabase Auth, roles, academic hierarchy and RLS.
- Phase 3: Admin CMS and audit infrastructure.
- Phase 4: current student academic context and enrollment model.
- Phase 5: question bank, assessment, grading, results and attempt security.
- Phase 6: XP ledger, achievement unlocks and idempotent rewards.

This contract is not permission to remove features or change locked defaults. Any required deviation must be recorded with the reason and approval before it is treated as a change to scope.
