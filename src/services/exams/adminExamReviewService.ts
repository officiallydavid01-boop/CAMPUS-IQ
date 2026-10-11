import { supabase } from "@/services/supabase/client";
import type { Exam, ExamAnswer, ExamAttempt, Question } from "@/types/database.types";

export interface PendingStructuredReview {
  answer: ExamAnswer;
  question: Question;
  attempt: ExamAttempt;
  exam: Pick<Exam, "id" | "title">;
}

export async function listPendingStructuredReviews(): Promise<PendingStructuredReview[]> {
  const { data: answers, error: answerError } = await supabase
    .from("exam_answers")
    .select("*")
    .is("is_correct", null)
    .order("answered_at", { ascending: true });
  if (answerError) throw answerError;
  if (!answers?.length) return [];

  const questionIds = [...new Set(answers.map((row) => row.question_id))];
  const attemptIds = [...new Set(answers.map((row) => row.exam_attempt_id))];
  const [{ data: questions, error: questionError }, { data: attempts, error: attemptError }] = await Promise.all([
    supabase.from("questions").select("*").in("id", questionIds).eq("question_type", "structured"),
    supabase.from("exam_attempts").select("*").in("id", attemptIds).eq("status", "submitted"),
  ]);
  if (questionError) throw questionError;
  if (attemptError) throw attemptError;
  const eligibleAnswers = answers.filter((answer) => questions?.some((question) => question.id === answer.question_id) && attempts?.some((attempt) => attempt.id === answer.exam_attempt_id));
  if (!eligibleAnswers.length) return [];

  const examIds = [...new Set((attempts ?? []).filter((attempt) => eligibleAnswers.some((answer) => answer.exam_attempt_id === attempt.id)).map((attempt) => attempt.exam_id))];
  const { data: exams, error: examError } = await supabase.from("exams").select("id,title").in("id", examIds);
  if (examError) throw examError;

  return eligibleAnswers.flatMap((answer) => {
    const question = questions?.find((item) => item.id === answer.question_id);
    const attempt = attempts?.find((item) => item.id === answer.exam_attempt_id);
    const exam = exams?.find((item) => item.id === attempt?.exam_id);
    return question && attempt && exam ? [{ answer, question, attempt, exam }] : [];
  });
}

export async function markStructuredExamAnswer(answerId: string, isCorrect: boolean): Promise<ExamAttempt> {
  const { data, error } = await supabase.rpc("mark_structured_exam_answer", {
    p_answer_id: answerId,
    p_is_correct: isCorrect,
  });
  if (error) throw error;
  return data as ExamAttempt;
}
