import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/017_phase5_exam_hardening.sql");
const examService = read("src/services/exams/examAttemptService.ts");
const examPage = read("src/pages/exams/ExamDetailPage.tsx");
const reviewPage = read("src/pages/admin/exams/AdminExamReviewPage.tsx");
const practiceService = read("src/services/practice/practiceService.ts");
const courseService = read("src/services/courses/coursesService.ts");
const adminExamService = read("src/services/exams/adminExamsService.ts");
const adminPastQuestionsPage = read("src/pages/admin/questions/AdminPastQuestionsPage.tsx");
const adminExamsPage = read("src/pages/admin/exams/AdminExamsPage.tsx");
const adminMigration = read("supabase/migrations/018_phase5_admin_exam_workflow.sql");
const accessMigration = read("supabase/migrations/019_phase5_exam_question_access.sql");

test("all ordered database migrations 001-027 exist", () => {
  const files = readdirSync(join(root, "supabase/migrations"));
  for (let i = 1; i <= 27; i++) {
    const prefix = String(i).padStart(3, "0") + "_";
    assert.ok(files.some((file) => file.startsWith(prefix) && file.endsWith(".sql")), `missing migration ${prefix}`);
  }
});

test("answer evaluator cannot be called directly by browser roles", () => {
  assert.match(migration, /revoke all on function public\.evaluate_answer\(uuid, uuid, text\) from public/i);
  assert.match(migration, /revoke all on function public\.evaluate_answer\(uuid, uuid, text\) from authenticated/i);
});

test("selected options are validated against the exact question", () => {
  assert.match(migration, /qo\.id = p_selected_option_id and qo\.question_id = p_question_id/i);
});

test("exam attempt limits and eligibility are checked by the database", () => {
  assert.match(migration, /create or replace function public\.start_exam_attempt/i);
  assert.match(migration, /v_exam\.attempt_limit is not null and v_attempt_count >= v_exam\.attempt_limit/i);
  assert.match(migration, /An active enrollment is required/i);
});

test("exam answers use a server-side RPC with expiry enforcement", () => {
  assert.match(migration, /create or replace function public\.save_exam_answer/i);
  assert.match(migration, /v_attempt\.started_at \+ make_interval\(mins => v_exam\.duration_minutes\)/i);
  assert.match(examService, /rpc\("save_exam_answer"/);
});

test("exam submission and grading use one retry-safe RPC", () => {
  assert.match(migration, /create or replace function public\.submit_exam_attempt/i);
  assert.match(examService, /rpc\("submit_exam_attempt"/);
  assert.match(examPage, /remainingSeconds/);
});

test("grading denominator uses the exam blueprint, not submitted answer count", () => {
  assert.match(migration, /select count\(\*\) into v_total_count from public\.exam_questions where exam_id = v_attempt\.exam_id/i);
});

test("structured responses have an Admin manual-review interface", () => {
  assert.match(migration, /create or replace function public\.mark_structured_exam_answer/i);
  assert.match(reviewPage, /Mark correct/);
  assert.match(reviewPage, /Mark incorrect/);
  assert.match(migration, /exam\.structured_answer_marked/i);
});

test("practice session and answer writes are routed through validating RPCs", () => {
  assert.match(migration, /create or replace function public\.start_practice_session/i);
  assert.match(migration, /create or replace function public\.submit_practice_answer/i);
  assert.match(migration, /revoke insert, update, delete on public\.practice_answers from public, anon, authenticated/i);
  assert.match(practiceService, /rpc\("submit_practice_answer"/);
  assert.match(practiceService, /rpc\("start_practice_session"/);
});

test("course enrollment validates academic context and capacity server-side", () => {
  assert.match(migration, /create or replace function public\.enroll_in_course_offering/i);
  assert.match(migration, /does not match your current academic context/i);
  assert.match(migration, /has reached capacity/i);
  assert.match(courseService, /rpc\("enroll_in_course_offering"/);
});

test("published content reads are scoped to academic context or enrollment", () => {
  assert.match(migration, /read enrolled published exams/i);
  assert.match(migration, /read enrolled published past_questions/i);
  assert.match(migration, /read enrolled published lessons/i);
  assert.match(migration, /create or replace view public\.questions_public/i);
});

test("retrying a submitted attempt does not erase Admin manual marks", () => {
  assert.match(migration, /v_attempt\.status = 'submitted' and v_attempt\.score is not null and v_attempt\.max_score is not null/i);
});


test("Admin exam creation and edits are transactional server-side operations", () => {
  assert.match(adminMigration, /create or replace function public\.admin_create_exam/i);
  assert.match(adminMigration, /create or replace function public\.admin_update_exam/i);
  assert.match(adminMigration, /Every selected question must be published, unique, and belong to this course/i);
  assert.match(adminMigration, /configuration cannot be edited after student attempts exist/i);
  assert.match(adminExamService, /rpc\("admin_create_exam"/);
  assert.match(adminExamService, /rpc\("admin_update_exam"/);
});

test("Admin exam form exposes difficulty, attempt limit, and availability schedule", () => {
  assert.match(adminExamsPage, /Attempt limit/);
  assert.match(adminExamsPage, /Available from/);
  assert.match(adminExamsPage, /Available until/);
  assert.match(adminExamsPage, /Difficulty/);
});

test("Admin past-question editor supports create, edit, and structured options", () => {
  assert.match(adminPastQuestionsPage, /updatePastQuestion/);
  assert.match(adminPastQuestionsPage, /Add option/);
  assert.match(adminPastQuestionsPage, /Correct/);
  assert.match(adminPastQuestionsPage, /exactly one correct/i);
});

test("past-question student filters cover session, semester, topic, and exam type", () => {
  const studentPastQuestions = read("src/pages/past-questions/PastQuestionsPage.tsx");
  assert.match(studentPastQuestions, /sessionFilter/);
  assert.match(studentPastQuestions, /semesterFilter/);
  assert.match(studentPastQuestions, /topicFilter/);
  assert.match(studentPastQuestions, /typeFilter/);
});

test("result review shows time, correct/incorrect counts, topic breakdown, and stored XP", () => {
  const results = read("src/pages/results/ResultDetailPage.tsx");
  assert.match(results, /Time taken/);
  assert.match(results, /Correct/);
  assert.match(results, /Incorrect/);
  assert.match(results, /Topic breakdown/);
  assert.match(results, /attempt\.xp_awarded/);
});


test("published exam question links are restricted to staff or enrolled students", () => {
  assert.match(accessMigration, /drop policy if exists "students read published exam question links"/i);
  assert.match(accessMigration, /students read enrolled published exam question links/i);
  assert.match(accessMigration, /ce\.student_id = auth\.uid\(\)/i);
  assert.match(accessMigration, /ce\.status in \('active', 'completed'\)/i);
});


test("exam taking has question jump navigation and explicit submit confirmation", () => {
  const examTaking = read("src/pages/exams/ExamDetailPage.tsx");
  assert.match(examTaking, /Jump to exam question/);
  assert.match(examTaking, /scrollIntoView/);
  assert.match(examTaking, /ConfirmDialog/);
  assert.match(examTaking, /Unanswered questions will count as incorrect/);
});

test("practice question request has one courseId field", () => {
  const practicePage = read("src/pages/practice/PracticeSessionPage.tsx");
  assert.doesNotMatch(practicePage, /courseId:[^\n]*\n\s*topicId:[^\n]*\n\s*courseId:/);
});

test("typecheck script uses TypeScript project build mode", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.typecheck, /tsc\s+-b/);
});
