import { supabase } from "@/services/supabase/client";
import type { PastQuestion } from "@/types/database.types";

/**
 * Student-facing read (Master Spec section 30: "support filtering by
 * course/year/session/semester/topic/exam type"). Past questions are
 * historical study material, not a live-graded exercise — the row
 * already carries `correct_answer_text`/`explanation`/`options`
 * (including which option `is_correct`, stored as jsonb on the row
 * itself), and RLS gates the whole row on `status = 'published'`, not
 * per-field like the live question bank. There is no separate "safe"
 * view needed here the way questions_public exists for questions,
 * because nothing about a past question is being actively attempted —
 * showing the answer alongside the question is the point.
 */
export async function getPublishedPastQuestions(courseId: string): Promise<PastQuestion[]> {
  const { data, error } = await supabase
    .from("past_questions")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "published")
    .order("session_label", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
