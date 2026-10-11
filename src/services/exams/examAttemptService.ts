import { supabase } from "@/services/supabase/client";
import type { Exam, ExamAnswer, ExamAttempt, ExamQuestionWithDetails } from "@/types/database.types";
import { recordGamificationActivity } from "@/services/gamification/gamificationService";

/**
 * Student-facing exam-taking flow (Master Spec sections 32-33, 48-49).
 * Question/option delivery goes through the student-safe views, same
 * pattern as practiceService.ts. Grading is a single explicit RPC call
 * (`submit_exam_attempt`, migration 017) at submission time — never
 * per-answer, so a student can't infer correctness of earlier answers by
 * re-querying mid-exam. Submission and grading happen in one retry-safe
 * database transaction; the browser never writes scores directly.
 */

export async function listAvailableExams(courseOfferingId: string): Promise<Exam[]> {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("course_offering_id", courseOfferingId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getExamById(examId: string): Promise<Exam | null> {
  const { data, error } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getExamQuestions(examId: string): Promise<ExamQuestionWithDetails[]> {
  const { data: links, error: linksError } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("display_order");
  if (linksError) throw linksError;
  if (!links || links.length === 0) return [];

  const questionIds = links.map((l) => l.question_id);

  const [{ data: questions, error: questionsError }, { data: options, error: optionsError }] = await Promise.all([
    supabase.from("questions_public").select("*").in("id", questionIds),
    supabase.from("question_options_public").select("*").in("question_id", questionIds),
  ]);
  if (questionsError) throw questionsError;
  if (optionsError) throw optionsError;

  const questionsById = new Map((questions ?? []).map((q) => [q.id, q]));

  return links
    .map((link) => {
      const question = questionsById.get(link.question_id);
      if (!question) return null;
      return {
        question_id: link.question_id,
        display_order: link.display_order,
        question,
        options: (options ?? [])
          .filter((o) => o.question_id === link.question_id)
          .sort((a, b) => a.display_order - b.display_order),
      };
    })
    .filter((x): x is ExamQuestionWithDetails => x !== null);
}

/** Client-side display helper only. The authoritative attempt-limit check
 * happens inside start_exam_attempt in migration 017 and cannot be bypassed
 * by modifying this frontend count. */
export async function countMyAttempts(studentId: string, examId: string): Promise<number> {
  const { count, error } = await supabase
    .from("exam_attempts")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("exam_id", examId);
  if (error) throw error;
  return count ?? 0;
}

export async function startExamAttempt(_studentId: string, examId: string): Promise<ExamAttempt> {
  // Identity, enrollment, availability and attempt limits are enforced by the
  // database RPC. The student ID argument remains for compatibility with the
  // existing page call, but is deliberately not trusted or sent to the server.
  const { data, error } = await supabase.rpc("start_exam_attempt", { p_exam_id: examId });
  if (error) throw error;
  return data as ExamAttempt;
}

export async function getMyInProgressAttempt(studentId: string, examId: string): Promise<ExamAttempt | null> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("student_id", studentId)
    .eq("exam_id", examId)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Upserts one answer for an in-progress attempt (a student can change
 * their answer before submitting). */
export async function saveExamAnswer(input: {
  examAttemptId: string;
  questionId: string;
  selectedOptionId?: string;
  answerText?: string;
  responseTimeMs?: number;
}): Promise<ExamAnswer> {
  const { data, error } = await supabase.rpc("save_exam_answer", {
    p_attempt_id: input.examAttemptId,
    p_question_id: input.questionId,
    p_selected_option_id: input.selectedOptionId ?? null,
    p_answer_text: input.answerText ?? null,
    p_response_time_ms: input.responseTimeMs ?? null,
  });
  if (error) throw error;
  return data as ExamAnswer;
}

export async function getMyExamAnswers(examAttemptId: string): Promise<ExamAnswer[]> {
  const { data, error } = await supabase.from("exam_answers").select("*").eq("exam_attempt_id", examAttemptId);
  if (error) throw error;
  return data ?? [];
}

/** Atomically submits and grades through the database RPC. The browser has
 * no direct write permission for attempt/answer tables, and retries return
 * the already-committed result without resetting manual marks. */
export async function submitExamAttempt(attemptId: string): Promise<ExamAttempt> {
  // Atomic, server-authoritative submission and grading. Safe to retry if a
  // mobile connection drops after the server commits the result.
  const { data, error } = await supabase.rpc("submit_exam_attempt", { p_attempt_id: attemptId });
  if (error) throw error;
  const attempt = data as ExamAttempt;
  if (attempt.status === "graded") await recordGamificationActivity("mock_exam", attempt.id);
  return attempt;
}

export async function getExamAttemptById(attemptId: string): Promise<ExamAttempt | null> {
  const { data, error } = await supabase.from("exam_attempts").select("*").eq("id", attemptId).maybeSingle();
  if (error) throw error;
  // If structured answers were awaiting Admin marking, viewing the now-graded
  // result retries the idempotent award path after the grade becomes final.
  if (data?.status === "graded") {
    await recordGamificationActivity("mock_exam", data.id);
    const { data: refreshed, error: refreshError } = await supabase.from("exam_attempts").select("*").eq("id", attemptId).maybeSingle();
    if (refreshError) throw refreshError;
    return refreshed;
  }
  return data;
}

export async function getMyExamAttempts(studentId: string): Promise<ExamAttempt[]> {
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CorrectAnswerRow {
  questionId: string;
  optionId: string | null;
  answerText: string | null;
}

/** Only returns data once the attempt is `graded` (the RPC itself
 * enforces this — see migration 016) — call after submitExamAttempt
 * resolves, on the results page, not before. */
export async function getGradedAttemptCorrectAnswers(attemptId: string): Promise<CorrectAnswerRow[]> {
  const { data, error } = await supabase.rpc("get_graded_attempt_correct_answers", { p_attempt_id: attemptId });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    questionId: row.r_question_id,
    optionId: row.r_option_id,
    answerText: row.r_answer_text,
  }));
}
