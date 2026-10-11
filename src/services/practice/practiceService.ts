import { supabase } from "@/services/supabase/client";
import type { Database, PracticeAnswer, PracticeMode, PracticeSession } from "@/types/database.types";
import { recordGamificationActivity } from "@/services/gamification/gamificationService";

type QuestionPublic = Database["public"]["Views"]["questions_public"]["Row"];
type QuestionOptionPublic = Database["public"]["Views"]["question_options_public"]["Row"];

export interface PracticeQuestion {
  question: QuestionPublic;
  options: QuestionOptionPublic[];
}

/**
 * Student-facing practice flow (Master Spec section 34). Reads questions
 * through the student-safe `questions_public`/`question_options_public`
 * views (never the base `questions`/`question_options` tables, which are
 * staff-only per RLS) — see docs/database-architecture.md "RLS model"
 * point 3. Grading is NOT done here: inserting a practice_answers row
 * with `is_correct: null` triggers `grade_practice_answer()` (migration
 * 016) to fill it in immediately, server-side.
 */

export async function startPracticeSession(
  _studentId: string,
  mode: PracticeMode,
  courseId?: string,
  topicId?: string
): Promise<PracticeSession> {
  const { data, error } = await supabase.rpc("start_practice_session", {
    p_mode: mode,
    p_course_id: courseId ?? null,
    p_topic_id: topicId ?? null,
  });
  if (error) throw error;
  return data as PracticeSession;
}

export async function endPracticeSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("end_practice_session", { p_practice_session_id: sessionId });
  if (error) throw error;
  await recordGamificationActivity("practice_session", sessionId);
}

/** Fetches a batch of practice questions for a topic or course, with
 * their (is_correct-free) options. `count` is a soft target — fewer
 * questions may exist. */
export async function getPracticeQuestions(params: {
  courseId?: string;
  topicId?: string;
  count?: number;
  mode?: PracticeMode;
  studentId?: string;
}): Promise<PracticeQuestion[]> {
  const count = params.count ?? 10;
  let questions: QuestionPublic[] = [];

  if (params.mode === "weak_topic") {
    if (!params.studentId || !params.courseId) return [];
    const { data: sessions, error: sessionsError } = await supabase
      .from("practice_sessions")
      .select("id")
      .eq("student_id", params.studentId)
      .eq("course_id", params.courseId);
    if (sessionsError) throw sessionsError;
    const sessionIds = (sessions ?? []).map((session) => session.id);
    if (sessionIds.length === 0) return [];

    const { data: incorrectAnswers, error: answersError } = await supabase
      .from("practice_answers")
      .select("question_id")
      .eq("is_correct", false)
      .in("practice_session_id", sessionIds);
    if (answersError) throw answersError;
    const questionIds = [...new Set((incorrectAnswers ?? []).map((answer) => answer.question_id))];
    if (questionIds.length === 0) return [];

    const { data, error } = await supabase
      .from("questions_public")
      .select("*")
      .eq("course_id", params.courseId)
      .in("id", questionIds)
      .limit(count);
    if (error) throw error;
    questions = data ?? [];
  } else {
    let query = supabase.from("questions_public").select("*").limit(count);
    if (params.topicId) query = query.eq("topic_id", params.topicId);
    else if (params.courseId) query = query.eq("course_id", params.courseId);
    const { data, error } = await query;
    if (error) throw error;
    questions = data ?? [];
  }

  if (questions.length === 0) return [];
  const { data: options, error: optionsError } = await supabase
    .from("question_options_public")
    .select("*")
    .in("question_id", questions.map((q) => q.id));
  if (optionsError) throw optionsError;

  return questions.map((question) => ({
    question,
    options: (options ?? []).filter((o) => o.question_id === question.id).sort((a, b) => a.display_order - b.display_order),
  }));
}

/** Submits one answer. The row comes back already graded (is_correct is
 * non-null) thanks to the AFTER INSERT trigger — no separate "grade" call
 * needed, unlike exams. */
export async function submitPracticeAnswer(input: {
  practiceSessionId: string;
  questionId: string;
  selectedOptionId?: string;
  answerText?: string;
  responseTimeMs?: number;
}): Promise<PracticeAnswer> {
  const { data, error } = await supabase.rpc("submit_practice_answer", {
    p_practice_session_id: input.practiceSessionId,
    p_question_id: input.questionId,
    p_selected_option_id: input.selectedOptionId ?? null,
    p_answer_text: input.answerText ?? null,
    p_response_time_ms: input.responseTimeMs ?? null,
  });
  if (error) throw error;
  return data as PracticeAnswer;
}

export async function getMyRecentPracticeSessions(studentId: string, limit = 10): Promise<PracticeSession[]> {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("student_id", studentId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Null until the student has actually answered this question (the RPC
 * itself enforces that — see migration 016) — render nothing, not an
 * error, when this comes back null. */
export async function getQuestionExplanation(questionId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_question_explanation", { p_question_id: questionId });
  if (error) throw error;
  return data;
}
