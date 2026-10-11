# Supabase Edge Functions

Empty in Phase 1/2 on purpose. This directory is where later phases add
the server-side logic that must never run as a plain client-writable
table operation, e.g.:

- **Exam/competition grading** (Phase 5/7) — computing `score` from
  submitted answers against `question_options.is_correct`, which the
  client can never read directly (see `questions_public` /
  `question_options_public` views and the RLS notes in
  `supabase/migrations/012_rls.sql`).
- **XP award functions** (Phase 6) — inserting legitimate
  `xp_transactions` rows for lesson completion, practice, exam, quest and
  achievement rewards, so the "one award per qualifying event" rule can
  be enforced with logic more complex than a single RLS `WITH CHECK`.
- **Streak advancement** (Phase 6) — evaluating "was today's activity
  meaningful" server-side.
- **Leaderboard recomputation** (Phase 7/8) — populating the
  `leaderboards` table on a schedule or in response to a finalized
  competition/tournament.
- **Bulk academic-data import** (Phase 3) — CSV/JSON import with
  validation, duplicate detection and dependency checking (Master Spec
  section 73).

None of these were implemented in Phase 1/2 per the phase boundary in the
build prompt ("do NOT attempt to fully implement... complete exam
engine... complete gamification logic... in this phase").

## Weekly challenge scheduler (Phase 7 follow-up)

`weekly-challenge-scheduler` calls the service-role-only database RPC in migration
`026_phase7_weekly_scheduler.sql`. It creates the next two occurrences per active
series using each series' IANA timezone and local weekday/start time. Occurrences
are keyed by their local date and safe to rerun. The Edge Function also requires a
separate `CAMPUSIQ_SCHEDULER_SECRET` bearer token; this is not the Supabase service
role key.

Deployment outline (run from the project folder with the Supabase CLI linked to the
intended **test** project first):

1. Apply migrations 001 through 033 in numeric order after reviewing the existing
   project's migration history. The connected CampusIQ project already has these migrations;
   do not reapply them manually to that project.
2. Set a long random `CAMPUSIQ_SCHEDULER_SECRET` using `supabase secrets set`.
3. Deploy with `supabase functions deploy weekly-challenge-scheduler --no-verify-jwt`.
   The custom bearer-secret check is mandatory because this endpoint is intentionally
   called by a scheduler rather than a signed-in user. Keep the secret private.
4. Configure Supabase Cron or an external scheduler to POST to
   `/functions/v1/weekly-challenge-scheduler` with `Authorization: Bearer <secret>`.
   Run daily; the database RPC is idempotent and maintains a two-occurrence horizon.
5. Check invocation logs and confirm generated rows in `weekly_challenge_instances`
   and `competitions`. Do not enable production scheduling until this succeeds in test.

Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend `.env` files, browser code, or source
control. Supabase injects it into the Edge Function environment; the handler does not
return it in responses. No scheduler is active merely because this function exists:
it must be deployed and explicitly scheduled.
