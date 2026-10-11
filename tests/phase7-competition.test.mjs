import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const files = readdirSync(join(root, "supabase/migrations"));
const m21 = read("supabase/migrations/021_phase7_competition_engine.sql");
const m22 = read("supabase/migrations/022_phase7_teams_tournaments_weekly.sql");
const m23 = read("supabase/migrations/023_phase7_security_and_schedule_controls.sql");
const m24 = read("supabase/migrations/024_phase7_tournament_formats_and_results.sql");
const m25 = read("supabase/migrations/025_phase7_tournament_match_attempts.sql");
const m26 = read("supabase/migrations/026_phase7_weekly_scheduler.sql");
const app = read("src/App.tsx");
const service = read("src/services/competitions/competitionService.ts");
const student = read("src/pages/competitions/CompetitionDetailPage.tsx");
const admin = read("src/pages/admin/competitions/AdminCompetitionsPage.tsx");
const tournamentAdmin = read("src/pages/admin/competitions/AdminTournamentsPage.tsx");

test("Phase 7 migrations are ordered after Phase 6", () => {
  for (const prefix of ["021_", "022_", "023_", "024_", "025_", "026_"]) assert.ok(files.some((f) => f.startsWith(prefix) && f.endsWith(".sql")), `${prefix} migration missing`);
  assert.match(m26, /run_weekly_challenge_scheduler/i);
  assert.match(m26, /service_role/i);
});
test("locked participation and attempt defaults are database constraints", () => {
  assert.match(m21, /participation_mode text not null default 'scheduled_live'\s+check \(participation_mode = 'scheduled_live'\)/i);
  assert.match(m21, /attempt_policy text not null default 'single_scored'\s+check \(attempt_policy = 'single_scored'\)/i);
  assert.match(m21, /dispute_window_hours integer not null default 48 check \(dispute_window_hours = 48\)/i);
  assert.match(service, /participation_mode: "scheduled_live"/);
  assert.match(service, /attempt_policy: "single_scored"/);
});
test("student writes to official attempts, answers, registrations and results are RPC-only", () => {
  assert.match(m21, /drop policy if exists "student registers for competition"/i);
  assert.match(m21, /drop policy if exists "student starts competition_attempt"/i);
  assert.match(m21, /drop policy if exists "student submits competition_attempt"/i);
  assert.match(m21, /drop policy if exists "student answers own competition"/i);
  assert.match(m23, /drop policy if exists "staff writes competition_results"/i);
  assert.match(m23, /drop policy if exists "staff grades competition_attempts"/i);
  assert.match(m21, /revoke all on function public\.submit_competition_attempt\(uuid\) from public, anon/i);
});
test("server derives identity, snapshots questions, validates deadlines and grades deterministically", () => {
  assert.match(m21, /v_uid uuid := auth\.uid\(\)/i);
  assert.match(m21, /question_snapshot jsonb/i);
  assert.match(m21, /published competition rules are immutable/i);
  assert.match(m21, /Attempt deadline has passed/i);
  assert.match(m21, /create or replace function public\.submit_competition_attempt/i);
  assert.match(m21, /selected_option_snapshot_id/i);
  assert.match(m21, /create or replace function public\.get_competition_attempt_answers/i);
});
test("provisional results, 48-hour disputes, corrections and XP finalization exist", () => {
  assert.match(m21, /dispute_until=coalesce\(cr\.dispute_until,now\(\)\+interval '48 hours'\)/i);
  assert.match(m21, /create table if not exists public\.competition_disputes/i);
  assert.match(m21, /create table if not exists public\.competition_score_corrections/i);
  assert.match(m21, /public\.ci_award_xp\(v_result\.student_id,v_comp\.xp_reward,'competition'/i);
  assert.match(m21, /resolve_competition_dispute/i);
});
test("team and weekly-series database foundations are present", () => {
  assert.match(m21, /create table if not exists public\.competition_teams/i);
  assert.match(m21, /create table if not exists public\.competition_team_members/i);
  assert.match(m21, /top_n_aggregate/i);
  assert.match(m21, /create table if not exists public\.weekly_challenge_series/i);
  assert.match(m21, /create table if not exists public\.weekly_challenge_instances/i);
  assert.match(m22, /generate_weekly_challenge_instance/i);
});
test("all three tournament formats and validated advancement are implemented", () => {
  assert.match(m21, /'single_elimination'/i);
  assert.match(m21, /'round_robin'/i);
  assert.match(m21, /'group_stage_knockout'/i);
  assert.match(m24, /advance_group_stage_to_knockout/i);
  assert.match(m24, /generate_tournament_matches/i);
  assert.match(m24, /record_tournament_match_result/i);
  assert.match(m24, /finalize_tournament_standings/i);
  assert.match(m25, /start_tournament_match_attempt/i);
  assert.match(m25, /submit_tournament_match_attempt/i);
});
test("student and Admin routes no longer use Phase 7 coming-soon placeholders", () => {
  assert.match(app, /<CompetitionsPage \/>/);
  assert.match(app, /<CompetitionDetailPage \/>/);
  assert.match(app, /<TournamentsPage \/>/);
  assert.match(app, /<TournamentDetailPage \/>/);
  assert.match(app, /<AdminCompetitionsPage \/>/);
  assert.match(app, /<AdminTournamentsPage \/>/);
  assert.doesNotMatch(app, /path: ROUTES\.competitions, title: "Competitions", phase: "Phase 7"/);
});
test("student competition actions call server RPCs rather than writing official scores", () => {
  assert.match(service, /rpc\("register_for_competition"/);
  assert.match(service, /rpc\("start_competition_attempt"/);
  assert.match(service, /rpc\("save_competition_answer"/);
  assert.match(service, /rpc\("submit_competition_attempt"/);
  assert.doesNotMatch(student, /from\("competition_results"\)\.insert/);
});
test("Admin interfaces support publication, disputes, teams and tournament match operations", () => {
  assert.match(admin, /publishCompetition\(/);
  assert.match(admin, /resolveCompetitionDispute\(/);
  assert.match(admin, /Weekly challenge series/);
  assert.match(tournamentAdmin, /Advance group qualifiers/);
  assert.match(tournamentAdmin, /Record result/);
  assert.match(tournamentAdmin, /Finalize standings/);
});

test("new SQL migration bodies have balanced dollar-quoted function blocks", () => {
  for (const name of ["021_phase7_competition_engine.sql","022_phase7_teams_tournaments_weekly.sql","023_phase7_security_and_schedule_controls.sql","024_phase7_tournament_formats_and_results.sql","025_phase7_tournament_match_attempts.sql"]) {
    const sql=read(`supabase/migrations/${name}`);
    assert.equal(sql.split("$$").length % 2, 1, `${name} has an unmatched dollar quote`);
  }
});
