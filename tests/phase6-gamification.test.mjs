import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/020_phase6_gamification_engine.sql");
const progress = read("src/services/learning/progressService.ts");
const practice = read("src/services/practice/practiceService.ts");
const exams = read("src/services/exams/examAttemptService.ts");
const service = read("src/services/gamification/gamificationService.ts");
const dashboard = read("src/pages/dashboard/DashboardPage.tsx");

test("migration 020 exists after all Phase 5 migrations", () => {
  const files = readdirSync(join(root, "supabase/migrations"));
  assert.ok(files.some((file) => file.startsWith("020_") && file.endsWith(".sql")));
});
test("XP ledger awards are idempotent per student, source and event", () => {
  assert.match(migration, /create unique index if not exists uq_xp_source_event/i);
  assert.match(migration, /on conflict \(student_id, source, source_id\).*do nothing/is);
  assert.match(migration, /unique \(student_id, activity_type, source_id\)/i);
});
test("students cannot write lesson completion directly", () => {
  assert.match(migration, /drop policy if exists "student writes own lesson_progress"/i);
  assert.match(migration, /create or replace function public\.complete_lesson/i);
  assert.match(migration, /Active course enrollment required/i);
  assert.match(progress, /rpc\("complete_lesson"/);
});
test("activity RPC derives identity from auth and validates activity records", () => {
  assert.match(migration, /v_student uuid := auth\.uid\(\)/i);
  assert.match(migration, /Completed practice session could not be verified/i);
  assert.match(migration, /Graded exam attempt could not be verified/i);
  assert.match(migration, /revoke all on function public\.record_gamification_activity\(text, uuid\) from public, anon/i);
});
test("lesson, practice and graded exam completions call the secure RPC", () => {
  assert.match(progress, /recordGamificationActivity\("lesson_completion", lessonId\)/);
  assert.match(practice, /recordGamificationActivity\("practice_session", sessionId\)/);
  assert.match(exams, /recordGamificationActivity\("mock_exam", attempt\.id\)/);
});
test("quests, streaks, levels and achievements are updated server-side", () => {
  assert.match(migration, /ci_update_quest_progress/i);
  assert.match(migration, /ci_update_streak/i);
  assert.match(migration, /ci_unlock_achievement/i);
  assert.match(migration, /ci_evaluate_achievements/i);
  assert.match(migration, /condition_type text not null default 'manual'/i);
  assert.match(migration, /ci_validate_level_config/i);
  assert.match(migration, /ci_level_for_xp/i);
});
test("student dashboard consumes persisted gamification state", () => {
  assert.match(service, /from\("user_xp"\)/);
  assert.match(service, /from\("quest_progress"\)/);
  assert.match(service, /from\("user_achievements"\)/);
  assert.match(dashboard, /Your learning momentum/);
  assert.match(dashboard, /Active quests/);
});
test("admin gamification routes are real screens, not coming-soon placeholders", () => {
  const app = read("src/App.tsx");
  assert.match(app, /AdminAchievementsPage/);
  assert.match(app, /AdminQuestsPage/);
  assert.match(app, /AdminXpPage/);
  assert.match(app, /AchievementsPage/);
  assert.match(app, /ProfilePage/);
  assert.match(read("src/pages/admin/gamification/AdminAchievementsPage.tsx"), /Unlock condition/);
  assert.match(read("src/pages/admin/gamification/AdminXpPage.tsx"), /Activity rewards/);
});
test("browser RPC accepts no client-selected student identity or XP amount", () => {
  assert.match(migration, /record_gamification_activity\(\s*p_activity_type text,\s*p_source_id uuid\s*\)/i);
  const signature = migration.match(/create or replace function public\.record_gamification_activity\(([\s\S]*?)\) returns jsonb/i)?.[1] ?? "";
  assert.doesNotMatch(signature, /p_student_id|p_amount|xp_amount/i);
  assert.match(migration, /v_student uuid := auth\.uid\(\)/i);
});
