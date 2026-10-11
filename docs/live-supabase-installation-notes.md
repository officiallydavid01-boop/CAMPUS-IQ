# CampusIQ live Supabase installation notes

## Applied state
- Project ref: `gfpcbdpauncdargcrxdw` (Campus IQ, eu-west-2)
- Source migrations 001-027 applied in order, with one syntax correction in migration 025 (an unmatched parenthesis in the duration calculation).
- Follow-up hardening migrations 028-029 secure question API views and harden function execution.
- Follow-up migrations 030–031 restrict anonymous role-helper execution and move `pg_trgm` into `extensions`; migration 032 adds missing foreign-key indexes; migration 033 blocks team-match question retrieval for completed/cancelled matches; migration 034 guards team-match answer reads and writes by match status and deadline; migration 035 optimizes auth.uid() use in RLS predicates; migration 036 revokes TRUNCATE and other non-application privileges from browser roles and changes future public-table defaults to SELECT-only; migration 037 revokes anonymous direct table/sequence writes; migration 038 restricts official attempts, answers, results, roles, and gamification ledgers to RPC-only mutations; migration 039 secures future public function and sequence defaults.
- 78 public base tables verified; RLS enabled on all 78.
- 206 public-schema RLS policies and 135 public-schema functions were present at verification.
- Seed data exists for roles/permissions, academic hierarchy, sample courses/offerings, XP levels, achievements, quests, and platform settings.
- Storage buckets: `avatars` (public), `banners` (public), `materials` (private).
- Privilege checks confirm `anon` cannot select either question view or execute the helper functions. Authenticated-context smoke queries returned zero rows for a non-enrolled test identity.

## Important limitations / remaining work
- The app frontend has not yet been connected or end-to-end tested against this project.
- The first admin role is not assigned automatically. After the intended admin account exists in Supabase Auth, follow `docs/database-architecture.md` to bootstrap `super_admin` through the documented SQL procedure. Do not add an email-based client-side role bypass.
- Security advisor still reports authenticated-callable SECURITY DEFINER RPCs. Anonymous execution has been removed from the reviewed public functions. Each authenticated-callable function still requires authorization-boundary testing; the advisor warning alone does not prove a vulnerability. `pg_trgm` has been moved to `extensions`.
- The unindexed-foreign-key performance notice was cleared by migration 032. Migration 033 was verified live against the function definition and grants. Remaining performance notices concern multiple permissive policies and unused indexes (expected before real workload); review them after functional QA and realistic data tests rather than rewriting policies blindly.
- The live migration ledger was reconciled after recovery. At the latest check, migrations 001-039 were present with unique versions and names. The local source package must retain migrations 030–039 to match the live schema. Keep migration files aligned with the live ledger before using CLI `db push` or `db reset`.
- This is not a production launch certification. Continue with auth tests, student/admin permission tests, scoring tests, frontend integration, and backup/deployment checks.
