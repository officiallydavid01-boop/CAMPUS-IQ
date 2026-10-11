# Phase 8: Integration & System Validation

## Goal

Verify that the Phase 1–7 source package plus security and performance follow-ups 028–039 is internally consistent, builds with its declared dependencies, and behaves correctly against the connected Supabase project and a disposable clean-install test project before production deployment. Static checks are useful early warnings, not proof of live database behaviour.

## Current environment evidence

The connected Supabase project `gfpcbdpauncdargcrxdw` has migrations 001–039 recorded, 78 public tables with RLS enabled, and zero public tables missing RLS. Migration 033 hardens team-tournament question retrieval; migration 034 applies equivalent match-status, live-window, and deadline checks to team-match answer reads and writes; migration 035 optimizes auth.uid() use in RLS predicates without changing their logical conditions; migrations 036–037 remove TRUNCATE and anonymous direct-write privileges, and set safer defaults for future tables; migration 038 removes direct browser-role mutation privileges from official student attempts, answers, scores, role grants, and gamification records; migration 039 secures default privileges for future functions and sequences. Anonymous access to the question views and reviewed security-definer RPCs is denied. This is a live schema/privilege check, not full role-based end-to-end certification.

| Check | Result | Meaning |
|---|---|---|
| Regression suite | 70 passed on 2026-10-11 | Source-contract tests and type-map coverage pass; no browser session is exercised |
| Phase 8 static preflight | PASS on 2026-10-11 | Checks migration sequence, frontend RPC/table/view references, 78/78 table type coverage, 76/76 live RPC names, post-baseline RLS declarations, and public environment template |
| Live schema/privilege spot checks | PASS for checked metadata | 78/78 public tables have RLS; 0 public SECURITY DEFINER functions are anon-executable; all 94 have fixed search_path; anon has no direct public-table write/TRUNCATE privileges; authenticated has no TRUNCATE privileges; official-record tables are RPC-only for browser DML; future public functions/sequences do not inherit browser grants; 39 unique migrations recorded |
| Dependency-backed typecheck/build | Blocked in this environment | `npm install` could not reach `registry.npmjs.org` (`EAI_AGAIN`); missing-dependency TypeScript errors are not a successful typecheck and are not evidence of source type errors by themselves |
| PostgreSQL migration execution | Not run | No connected disposable database or PostgreSQL/Supabase CLI is available in this environment |
| Live auth/RLS/RPC/browser integration | Not run | Requires a test Supabase project and test accounts/data |

## Local checks

Run from the project root:

```bash
npm run preflight
npm test
npm run typecheck
npm run lint
npm run build
```

The first two commands use Node's built-in test runner and do not require project packages to be installed. The connected Supabase project currently has 39 recorded migrations; source migrations must remain aligned with that history. The last three require a successful `npm install`. A Vercel preview can be used to complete the runtime build and live-browser gates once the source is pushed to GitHub; see [`preview-deployment.md`](preview-deployment.md).

## Safe Supabase validation sequence

1. Create or choose a **disposable test project**, not the production project.
2. Confirm the project has no important data. Review its migration history before applying anything.
3. Install the Supabase CLI and authenticate locally. Link the CLI only to the test project.
4. Review every migration `001` through `039` in numeric order. The connected project already records these migrations; do not apply them a second time to that project.
5. Apply the migrations to the disposable test project using the CLI's migration workflow. If the project has manual schema changes or migration-history drift, stop and reconcile before pushing.
6. Create separate test accounts for at least two students and one Admin; create valid academic structure and course offerings through the database/Admin workflow.
7. Validate login, session persistence, onboarding/context changes, course enrollment, lesson completion, practice, exam attempts/grading, XP idempotency, competitions, disputes, individual/team tournament attempts, notifications, and weekly challenge generation.
8. Test access boundaries while signed in as Student A, Student B, Admin, and Super Admin. Confirm a student cannot read another student's private answers, attempts, profile-sensitive fields, or notifications; confirm students cannot directly write official scores, XP, result corrections, or roles.
9. Test scheduler Edge Function deployment only in the test project. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side and store `CAMPUSIQ_SCHEDULER_SECRET` as an Edge Function secret, not in frontend environment variables.
10. Record failures, fix them in source/migrations, rerun checks from a clean test database, and only then consider Phase 9.

## Required release gates

- [x] `npm run preflight` passes (39 migrations, 78/78 table types, 76/76 RPC names).
- [x] `npm test` passes (70 tests).
- [ ] Dependency-backed typecheck, lint and production build pass.
- [ ] Migrations 001–039 apply cleanly to a disposable project from a clean baseline.
- [ ] Auth/session lifecycle and academic-context updates work end-to-end.
- [ ] RLS tests pass for each role and cross-student privacy boundary.
- [ ] Critical RPCs and retry/idempotency cases pass against real database state.
- [ ] Individual and team tournament workflows pass, including roster locking, scoring, disputes, advancement and finalization.
- [ ] Weekly scheduler is verified in test and does not leak secrets.
- [ ] Mobile and desktop browser smoke tests pass.

**Status:** Phase 8 is in progress. Static checks and live schema/privilege spot checks pass. The Supabase advisor no longer reports the auth.uid() RLS initplan category after migration 035. It still reports 34 multiple-permissive-policy warnings and 63 authenticated-callable SECURITY DEFINER warnings because these are the authenticated RPC boundary; they are documented for per-function review, not blindly revoked. Do not enable real-student competitions until dependency-backed build/typecheck, real-role RLS/RPC tests, and browser smoke tests pass.
