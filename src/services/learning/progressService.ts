import { supabase } from "@/services/supabase/client";
import type { LessonProgress, TopicProgress } from "@/types/database.types";
import { recordGamificationActivity } from "@/services/gamification/gamificationService";

/**
 * Learning progress tracking. Lesson completion timestamps are written by a
 * database RPC that verifies publication and active enrollment. XP is awarded
 * by a separate verified, idempotent server-side activity RPC.
 */

export async function getLessonProgress(studentId: string, lessonId: string): Promise<LessonProgress | null> {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("*")
    .eq("student_id", studentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** All of a student's lesson_progress rows for lessons within one topic,
 * keyed by lesson_id — used to render a checkmark next to each completed
 * lesson in TopicDetailPage without one query per lesson. */
export async function getLessonProgressForTopic(
  studentId: string,
  lessonIds: string[]
): Promise<Record<string, LessonProgress>> {
  if (lessonIds.length === 0) return {};
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("*")
    .eq("student_id", studentId)
    .in("lesson_id", lessonIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.lesson_id, row]));
}

export async function getTopicProgress(studentId: string, topicId: string): Promise<TopicProgress | null> {
  const { data, error } = await supabase
    .from("topic_progress")
    .select("*")
    .eq("student_id", studentId)
    .eq("topic_id", topicId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Marks a lesson complete for the student and recomputes the parent
 * topic's rollup (lessons_completed / lessons_total / completed_at).
 * Idempotent — completing an already-completed lesson again just updates
 * `completed_at` and leaves `xp_awarded` untouched (never included in the
 * update payload), so it can never be used to re-trigger an award once
 * Phase 6 adds one.
 */
export async function markLessonComplete(studentId: string, lessonId: string, topicId: string): Promise<void> {
  // The database verifies the published lesson and active enrollment, then
  // writes the completion timestamp. Students cannot manufacture it via table writes.
  const { error } = await supabase.rpc("complete_lesson", { p_lesson_id: lessonId });
  if (error) throw error;
  await recomputeTopicProgress(studentId, topicId);
  await recordGamificationActivity("lesson_completion", lessonId);
}

async function recomputeTopicProgress(studentId: string, topicId: string): Promise<void> {
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("topic_id", topicId)
    .eq("status", "published");
  if (lessonsError) throw lessonsError;

  const lessonIds = (lessons ?? []).map((l) => l.id);
  const lessonsTotal = lessonIds.length;

  let lessonsCompleted = 0;
  if (lessonIds.length > 0) {
    const { count, error: countError } = await supabase
      .from("lesson_progress")
      .select("*", { count: "exact", head: true })
      .eq("student_id", studentId)
      .in("lesson_id", lessonIds)
      .not("completed_at", "is", null);
    if (countError) throw countError;
    lessonsCompleted = count ?? 0;
  }

  const existing = await getTopicProgress(studentId, topicId);
  const completedAt = lessonsTotal > 0 && lessonsCompleted >= lessonsTotal ? new Date().toISOString() : null;

  if (existing) {
    const { error } = await supabase
      .from("topic_progress")
      .update({ lessons_completed: lessonsCompleted, lessons_total: lessonsTotal, completed_at: completedAt })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("topic_progress").insert({
      student_id: studentId,
      topic_id: topicId,
      lessons_completed: lessonsCompleted,
      lessons_total: lessonsTotal,
      completed_at: completedAt,
    });
    if (error) throw error;
  }
}
