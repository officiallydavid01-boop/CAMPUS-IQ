import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type { ContentStatus, DifficultyLevel, Exam, ExamType, Question } from "@/types/database.types";

/** Admin CRUD for exams + attaching questions from the bank (Master Spec
 * sections 31-32). Exams attach to a course_offering (a specific
 * delivery), unlike questions/topics/lessons which attach to the
 * reusable course — see the design note in
 * supabase/migrations/004_academic_structure.sql: an exam is naturally
 * tied to "this semester's sitting," so re-using it across offerings the
 * way a lesson is re-used doesn't make the same sense. */

export async function adminListExams(courseOfferingId: string): Promise<Exam[]> {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .eq("course_offering_id", courseOfferingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface ExamInput {
  courseOfferingId: string;
  title: string;
  description?: string;
  examType: ExamType;
  durationMinutes: number;
  questionIds: string[];
  difficulty?: DifficultyLevel;
  attemptLimit?: number;
  availableFrom?: string;
  availableUntil?: string;
}

export async function createExam(input: ExamInput): Promise<Exam> {
  const { data, error } = await supabase.rpc("admin_create_exam", {
    p_course_offering_id: input.courseOfferingId,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_exam_type: input.examType,
    p_duration_minutes: input.durationMinutes,
    p_question_ids: input.questionIds,
    p_difficulty: input.difficulty ?? "medium",
    p_attempt_limit: input.attemptLimit ?? null,
    p_available_from: input.availableFrom ?? null,
    p_available_until: input.availableUntil ?? null,
  });
  if (error) throw error;
  const exam = data as Exam;
  await logAuditEvent("exam.created", "exam", exam.id, { title: input.title, question_count: input.questionIds.length });
  return exam;
}

export async function adminListExamQuestionIds(examId: string): Promise<string[]> {
  const { data, error } = await supabase.from("exam_questions").select("question_id").eq("exam_id", examId).order("display_order");
  if (error) throw error;
  return (data ?? []).map((row) => row.question_id);
}

export async function updateExam(id: string, input: Omit<ExamInput, "courseOfferingId">): Promise<Exam> {
  const { data, error } = await supabase.rpc("admin_update_exam", {
    p_exam_id: id,
    p_title: input.title.trim(),
    p_description: input.description?.trim() || null,
    p_exam_type: input.examType,
    p_duration_minutes: input.durationMinutes,
    p_question_ids: input.questionIds,
    p_difficulty: input.difficulty ?? "medium",
    p_attempt_limit: input.attemptLimit ?? null,
    p_available_from: input.availableFrom ?? null,
    p_available_until: input.availableUntil ?? null,
  });
  if (error) throw error;
  const exam = data as Exam;
  await logAuditEvent("exam.updated", "exam", id, { title: input.title, question_count: input.questionIds.length });
  return exam;
}

export async function updateExamStatus(id: string, status: ContentStatus): Promise<void> {
  const { error } = await supabase.from("exams").update({ status }).eq("id", id);
  if (error) throw error;
  await logAuditEvent("exam.status_changed", "exam", id, { status });
}

/** Questions eligible to attach to an exam for a course — staff sees the
 * real question bank here (not the student-safe view), since choosing
 * questions for an exam requires seeing which ones exist regardless of
 * publish status. */
export async function listEligibleQuestions(courseId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const EXAM_TYPE_OPTIONS: { value: ExamType; label: string }[] = [
  { value: "mock_exam", label: "Mock exam" },
  { value: "course_exam", label: "Course exam" },
  { value: "topic_exam", label: "Topic exam" },
  { value: "mixed_exam", label: "Mixed exam" },
];
