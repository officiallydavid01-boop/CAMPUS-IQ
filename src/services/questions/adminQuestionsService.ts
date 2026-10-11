import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type { ContentStatus, DifficultyLevel, Question, QuestionOption, QuestionType } from "@/types/database.types";

/**
 * Admin CRUD for the question bank (Master Spec section 29). Correctness
 * data (question_options.is_correct, questions.correct_answer_text) is
 * only ever visible/writable here — staff-only, per RLS
 * (012_rls.sql "staff only question_options"). Student-facing question
 * delivery goes through the questions_public/question_options_public
 * views instead (see services/practice/practiceService.ts and
 * services/exams/examAttemptService.ts) — never this service.
 */

export async function adminListQuestions(courseId: string, topicId?: string): Promise<Question[]> {
  let query = supabase.from("questions").select("*").eq("course_id", courseId).order("created_at", { ascending: false });
  if (topicId) query = query.eq("topic_id", topicId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface QuestionInput {
  courseId: string;
  topicId?: string;
  questionType: QuestionType;
  prompt: string;
  difficulty: DifficultyLevel;
  explanation?: string;
  source?: string;
  xpValue?: number;
  correctAnswerText?: string;
}

export async function createQuestion(input: QuestionInput): Promise<Question> {
  const { data, error } = await supabase
    .from("questions")
    .insert({
      course_id: input.courseId,
      topic_id: input.topicId,
      question_type: input.questionType,
      prompt: input.prompt,
      difficulty: input.difficulty,
      explanation: input.explanation,
      source: input.source,
      xp_value: input.xpValue ?? 5,
      correct_answer_text: input.correctAnswerText,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("question.created", "question", data.id, { question_type: input.questionType });
  return data;
}

export async function updateQuestion(
  id: string,
  input: Partial<
    Pick<Question, "prompt" | "difficulty" | "explanation" | "source" | "xp_value" | "correct_answer_text" | "status" | "topic_id">
  >
): Promise<Question> {
  const { data, error } = await supabase.from("questions").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent(input.status ? "question.status_changed" : "question.updated", "question", id, input);
  return data;
}

// ---- Options (multiple_choice / true_false) ----

export async function adminListQuestionOptions(questionId: string): Promise<QuestionOption[]> {
  const { data, error } = await supabase
    .from("question_options")
    .select("*")
    .eq("question_id", questionId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function replaceQuestionOptions(
  questionId: string,
  options: { optionText: string; isCorrect: boolean }[]
): Promise<void> {
  // Simplest correct approach for a small option set (2-6 rows): delete
  // and re-insert, inside one logical operation from the caller's point
  // of view. A partial failure here just means the admin re-saves — this
  // is CMS authoring, not a student-facing transaction with real-money-
  // equivalent stakes, so the extra complexity of a stored procedure to
  // make it atomic isn't justified.
  const { error: deleteError } = await supabase.from("question_options").delete().eq("question_id", questionId);
  if (deleteError) throw deleteError;

  if (options.length === 0) return;

  const { error: insertError } = await supabase.from("question_options").insert(
    options.map((opt, index) => ({
      question_id: questionId,
      option_text: opt.optionText,
      is_correct: opt.isCorrect,
      display_order: index,
    }))
  );
  if (insertError) throw insertError;
  await logAuditEvent("question.options_replaced", "question", questionId, { option_count: options.length });
}

export const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "numerical", label: "Numerical" },
  { value: "short_answer", label: "Short answer" },
  { value: "structured", label: "Structured (manually graded)" },
];

export const DIFFICULTY_OPTIONS: { value: DifficultyLevel; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const QUESTION_STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];
