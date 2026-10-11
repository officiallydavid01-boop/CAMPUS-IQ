import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

test('Phase 7 completion migration follows the weekly scheduler migration', () => {
  assert.ok(existsSync(join(root, 'supabase/migrations/027_phase7_team_tournament_and_notifications.sql')));
  const files = ['021_phase7_competition_engine.sql','022_phase7_teams_tournaments_weekly.sql','023_phase7_security_and_schedule_controls.sql','024_phase7_tournament_formats_and_results.sql','025_phase7_tournament_match_attempts.sql','026_phase7_weekly_scheduler.sql','027_phase7_team_tournament_and_notifications.sql'];
  for (const file of files) assert.ok(existsSync(join(root,'supabase/migrations',file)), `${file} missing`);
});

test('team tournaments have server-side registration, attempt, scoring and group advancement RPCs', () => {
  const sql = read('supabase/migrations/027_phase7_team_tournament_and_notifications.sql');
  for (const contract of [
    'participant_mode', 'team_competition_id', 'tournament_team_participants',
    'register_team_for_tournament', 'list_my_tournament_teams', 'generate_tournament_team_matches',
    'start_tournament_team_match_attempt', 'save_tournament_team_match_answer',
    'submit_tournament_team_match_attempt', 'ci_complete_tournament_team_match',
    'advance_team_group_stage_to_knockout', 'finalize_team_tournament_standings', 'team_top_n', 'ci_guard_tournament_mode_config',
  ]) assert.ok(sql.includes(contract), `missing team tournament contract ${contract}`);
  assert.match(sql, /revoke all on function public\.ci_complete_tournament_team_match\(uuid\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.submit_tournament_team_match_attempt\(uuid\) to authenticated/i);
});

test('notification triggers respect student preferences and student notification UI is wired', () => {
  const sql = read('supabase/migrations/027_phase7_team_tournament_and_notifications.sql');
  const service = read('src/services/competitions/competitionService.ts');
  const page = read('src/pages/notifications/NotificationsPage.tsx');
  const app = read('src/App.tsx');
  assert.ok(sql.includes('ci_notify_student'));
  assert.ok(sql.includes('ci_notify_tournament_status'));
  assert.ok(sql.includes('ci_notify_competition_result'));
  assert.ok(service.includes('listMyNotifications'));
  assert.ok(service.includes('markAllNotificationsRead'));
  assert.ok(page.includes('Mark all read'));
  assert.ok(app.includes('path={ROUTES.notifications}'));
});

test('team tournament UI exposes team mode and student team registration', () => {
  const admin = read('src/pages/admin/competitions/AdminTournamentsPage.tsx');
  const detail = read('src/pages/tournaments/TournamentDetailPage.tsx');
  const attempt = read('src/pages/tournaments/TournamentTeamMatchAttemptPage.tsx');
  assert.ok(admin.includes('Registered teams'));
  assert.ok(admin.includes('teamCompetitionId'));
  assert.ok(detail.includes('Register one of your teams'));
  assert.ok(detail.includes('registerTeamForTournament'));
  assert.ok(attempt.includes('submitTournamentTeamMatchAttempt'));
});

test('new migration function dollar quote delimiters are balanced', () => {
  const sql = read('supabase/migrations/027_phase7_team_tournament_and_notifications.sql');
  const count = (sql.match(/\$\$/g) ?? []).length;
  assert.equal(count % 2, 0, 'unbalanced $$ delimiters');
});
