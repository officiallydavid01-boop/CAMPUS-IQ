# CampusIQ SECURITY DEFINER review (Phase 8)

## Current live-project findings

The live Supabase project was checked on 2026-10-11. At that check:

- 94 functions in `public` were marked `SECURITY DEFINER`.
- 63 were executable by the `authenticated` role.
- 0 were executable by `anon`.
- `anon` and `authenticated` both lack `CREATE` on schema `public`, so the 34 functions configured with `search_path=public` are not exposed to object-shadowing by those browser roles. All functions have a configured search path.
- All 94 had a fixed function `search_path` configuration.
- Static body-marker review found that 62 of the 63 authenticated-callable functions directly reference `auth.uid()` or are among the three role helpers that delegate to `has_role`, which resolves the role for `auth.uid()`. The remaining function, `get_competition_leaderboard`, returns only published results for published competitions. Marker checks are a triage aid, not proof of correct authorization; the full body and data-flow for each function must still be reviewed before release.

## Live authorization smoke test

A transaction simulated an authenticated identity with no assigned role, invoked `publish_competition`, `publish_tournament`, and `admin_create_exam`, and verified that all three failed with their expected `Admin permission required` / `Staff access required` guards. The transaction was rolled back; no records were created. This is a targeted negative smoke test, not a full role matrix.

## Why the 63 advisor warnings are not blindly revoked

Supabase's `authenticated_security_definer_function_executable` advisor is a permission-pattern warning. It cannot determine whether the function body contains appropriate authorization. Revoke-all would break core workflows, and switching all functions to `SECURITY INVOKER` would cause operations protected by RLS to fail or expose data if the policies were broadened to compensate.

The correct remediation is per-function: keep the definer boundary only where needed, require identity/ownership or explicit staff/admin authorization in the body, use a fixed `search_path`, and deny anonymous execution. The project has already revoked anonymous access to the reviewed role helpers and question-view helper functions. Do not remove the remaining authenticated grants until an equivalent, tested RPC/Edge Function path replaces each one.

## Regressions to rerun after database changes

1. Confirm no public `SECURITY DEFINER` function is executable by `anon`.
2. Confirm every `SECURITY DEFINER` function has a fixed `search_path`.
3. Audit the function body and authorization boundary for every newly added or modified authenticated-callable function.
4. Test with real student, staff, admin, and Super Admin accounts: cross-student access, grading and correct-answer visibility, competition disputes/results, and tournament match/advancement mutations.

This is a static permission/body-marker review plus targeted live metadata and negative-authorization checks, not a certification that every function is vulnerability-free. The remaining advisor notices are documented intentionally callable RPCs, but each function's authorization must be validated with real student/staff/Admin sessions before production use.


## Additional endpoint review (2026-10-11)

Review of the live `get_tournament_team_match_attempt_questions(uuid)` definition found that it verified the caller owned an in-progress attempt and that the tournament was live, but did not explicitly reject a match whose own status had already become `completed`, `walkover`, or `cancelled`. Migration 033 now permits question retrieval only while the match status is `scheduled` or `in_progress`, while preserving the student ownership, active attempt, tournament live-window, and deadline checks. Anonymous execute remains revoked; `authenticated` retains execute. The live function definition and grants were checked after applying migration 033. This is a targeted hardening fix, not a substitute for testing with real accounts and representative tournament records.


A follow-up review of team-match answer handling found that `save_tournament_team_match_answer(uuid, uuid, uuid, text)` checked the tournament status and deadline but did not independently reject a completed/cancelled match, and the answer-read RPC had no match-status or deadline guard. Migration 034 now requires an owned in-progress attempt, an accepting match status (`scheduled` or `in_progress`), a live tournament, and an unexpired match window for both reads and writes. Anonymous execution remains revoked. This is still a targeted fix, not full role-based certification.
