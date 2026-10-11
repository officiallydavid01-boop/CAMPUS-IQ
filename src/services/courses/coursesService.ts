import { supabase } from "@/services/supabase/client";
import type { CourseOfferingWithCourse, CourseTopic, Lesson, MaterialWithFile } from "@/types/database.types";

/**
 * "Student course filtering" (Master Spec "IMPORTANT CLARIFICATION"):
 * the course list shown to a student is derived entirely from their
 * current academic context (institution/programme/level/semester),
 * queried live against course_offerings — never a hardcoded or
 * client-cached list. Changing context (services/academic) and re-calling
 * this function is the entire mechanism; no source code change is needed
 * for a new semester's offerings to appear.
 *
 * RLS (012_rls.sql, "read published course_offerings") already guarantees
 * a student can only ever receive published rows here — the filters below
 * narrow *which* published rows, not whether unpublished ones leak
 * through.
 */
export async function getCourseOfferingsForContext(context: {
  institutionId: string;
  programmeId: string;
  levelId: string;
  semesterId: string;
}): Promise<CourseOfferingWithCourse[]> {
  const { data, error } = await supabase
    .from("course_offerings")
    .select("*, course:courses(*)")
    .eq("institution_id", context.institutionId)
    .eq("programme_id", context.programmeId)
    .eq("level_id", context.levelId)
    .eq("semester_id", context.semesterId)
    .eq("status", "published")
    .order("created_at");

  if (error) throw error;
  return (data ?? []) as unknown as CourseOfferingWithCourse[];
}

export async function enrollInOffering(_studentId: string, courseOfferingId: string) {
  // The database derives the authenticated user and validates academic context
  // and capacity. Never trust a student ID supplied by the browser.
  const { error } = await supabase.rpc("enroll_in_course_offering", { p_course_offering_id: courseOfferingId });
  if (error) throw error;
}

export async function listMyEnrollments(studentId: string) {
  // Full history, not just the current context — deliberately unfiltered
  // by semester/level so a student's past enrollments remain visible
  // after they progress (see 004_academic_structure.sql design note).
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("*, course_offering:course_offerings(*, course:courses(*))")
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ========================================================================
// Topics, lessons & materials (Phase 4) — student-facing reads only.
// ========================================================================
// Every function below relies entirely on RLS ("read published ...") to
// keep draft/review/archived content invisible — none of these add their
// own status filter, because the database is the actual gate, not the
// query shape. See docs/database-architecture.md "Publishing model".

export async function getCourseOfferingById(id: string): Promise<CourseOfferingWithCourse | null> {
  const { data, error } = await supabase
    .from("course_offerings")
    .select("*, course:courses(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as CourseOfferingWithCourse | null;
}

export async function getCourseTopics(courseId: string): Promise<CourseTopic[]> {
  const { data, error } = await supabase
    .from("course_topics")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function getTopicById(topicId: string): Promise<CourseTopic | null> {
  const { data, error } = await supabase.from("course_topics").select("*").eq("id", topicId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getTopicLessons(topicId: string): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("topic_id", topicId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function getLessonById(lessonId: string): Promise<Lesson | null> {
  const { data, error } = await supabase.from("lessons").select("*").eq("id", lessonId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Previous/next lesson within the same topic, by display_order — powers
 * the LessonDetailPage's Previous/Complete/Next controls (Master Spec
 * section 35). Returns null for either end when there's nowhere to go. */
export async function getAdjacentLessons(
  topicId: string,
  currentDisplayOrder: number
): Promise<{ previous: Lesson | null; next: Lesson | null }> {
  const [prevResult, nextResult] = await Promise.all([
    supabase
      .from("lessons")
      .select("*")
      .eq("topic_id", topicId)
      .lt("display_order", currentDisplayOrder)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("*")
      .eq("topic_id", topicId)
      .gt("display_order", currentDisplayOrder)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (prevResult.error) throw prevResult.error;
  if (nextResult.error) throw nextResult.error;
  return { previous: prevResult.data, next: nextResult.data };
}

/**
 * Materials attached to a lesson, with their file metadata joined. Note:
 * this returns metadata only — actually producing a downloadable link
 * requires a signed URL from Supabase Storage
 * (`supabase.storage.from(bucket).createSignedUrl(path, ttl)`), generated
 * on demand by the page that renders the download button rather than
 * here, since a signed URL is time-limited and shouldn't be cached in a
 * list fetch. See docs/database-architecture.md "Storage model" — the
 * `materials` bucket referenced there doesn't exist until you create it
 * in your own Supabase project.
 */
export async function getLessonMaterials(lessonId: string): Promise<MaterialWithFile[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("*, file:files(*)")
    .eq("lesson_id", lessonId)
    .eq("status", "published");
  if (error) throw error;
  return (data ?? []) as unknown as MaterialWithFile[];
}
