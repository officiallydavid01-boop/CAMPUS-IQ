import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type { ContentStatus, ExamType, PastQuestion } from "@/types/database.types";

/** Admin CRUD for past questions (Master Spec section 30). Simpler than
 * the live question bank: options (for MCQ-style past questions) are
 * stored as a plain jsonb array on the row itself rather than a separate
 * table, since past questions are historical/static records, not
 * something students attempt live with per-answer grading. */

export async function adminListPastQuestions(courseId: string): Promise<PastQuestion[]> {
  const { data, error } = await supabase
    .from("past_questions")
    .select("*")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface PastQuestionInput {
  courseId: string;
  institutionId?: string;
  topicId?: string;
  sessionLabel: string;
  semesterLabel?: string;
  examType: ExamType;
  prompt: string;
  options?: { text: string; is_correct: boolean }[];
  correctAnswerText?: string;
  explanation?: string;
}

export async function createPastQuestion(input: PastQuestionInput): Promise<PastQuestion> {
  const { data, error } = await supabase
    .from("past_questions")
    .insert({
      course_id: input.courseId,
      institution_id: input.institutionId,
      topic_id: input.topicId,
      session_label: input.sessionLabel,
      semester_label: input.semesterLabel,
      exam_type: input.examType,
      prompt: input.prompt,
      options: input.options && input.options.length > 0 ? input.options : null,
      correct_answer_text: input.correctAnswerText,
      explanation: input.explanation,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("past_question.created", "past_question", data.id, { session_label: input.sessionLabel });
  return data;
}

export async function updatePastQuestionStatus(id: string, status: ContentStatus): Promise<void> {
  const { error } = await supabase.from("past_questions").update({ status }).eq("id", id);
  if (error) throw error;
  await logAuditEvent("past_question.status_changed", "past_question", id, { status });
}


export async function updatePastQuestion(id: string, input: Omit<PastQuestionInput, "courseId">): Promise<void> {
  const { error } = await supabase.from("past_questions").update({
    institution_id: input.institutionId,
    topic_id: input.topicId,
    session_label: input.sessionLabel,
    semester_label: input.semesterLabel,
    exam_type: input.examType,
    prompt: input.prompt,
    options: input.options && input.options.length > 0 ? input.options : null,
    correct_answer_text: input.correctAnswerText,
    explanation: input.explanation,
  }).eq("id", id);
  if (error) throw error;
  await logAuditEvent("past_question.updated", "past_question", id, { session_label: input.sessionLabel });
}
