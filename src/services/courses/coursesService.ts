
import { supabase } from "@/services/supabase/client";
import type {
  CourseOfferingWithCourse,
  CourseTopic,
  Lesson,
  MaterialWithFile,
} from "@/types/database.types";

/**
 * Student course filtering:
 * Course offerings are derived from the student's current academic
 * context and fetched live from course_offerings.
 *
 * RLS remains responsible for restricting access to published offerings.
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

/**
 * Enroll the authenticated student in an offering.
 * The database RPC determines the student identity and validates
 * the academic context and course capacity.
 */
export async function enrollInOffering(
  _studentId: string,
  courseOfferingId: string
) {
  const { error } = await supabase.rpc("enroll_in_course_offering", {
    p_course_offering_id: courseOfferingId,
  });

  if (error) throw error;
}

/**
 * Returns the student's full enrollment history, including previous
 * semesters and levels.
 */
export async function listMyEnrollments(studentId: string) {
  const { data, error } = await supabase
    .from("course_enrollments")
    .select("*, course_offering:course_offerings(*, course:courses(*))")
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false });

  if (error) throw error;

  return data ?? [];
}

/**
 * Retrieves a course offering by ID.
 */
export async function getCourseOfferingById(
  id: string
): Promise<CourseOfferingWithCourse | null> {
  const { data, error } = await supabase
    .from("course_offerings")
    .select("*, course:courses(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  return data as unknown as CourseOfferingWithCourse | null;
}

/**
 * Retrieves topics belonging to a course and any approved canonical
 * content sources linked to that course.
 *
 * Link direction:
 *   source_course_id -> linked_course_id
 *
 * A linked course receives topics from its approved source courses,
 * while retaining its own department-specific topics.
 *
 * Topics and lessons are not copied. Their original IDs remain intact,
 * preserving existing references used by lessons and student progress.
 *
 * Database RLS policies remain responsible for access control.
 */
export async function getCourseTopics(
  courseId: string
): Promise<CourseTopic[]> {
  // Fetch approved canonical sources linked to this course.
  // The generated database types may not yet contain the new table,
  // so the cast is limited to this query.

  const { data: links, error: linksError } = await supabase
    .from("course_content_links")
    .select("source_course_id")
    .eq("linked_course_id", courseId)
    .eq("status", "approved");

  if (linksError) throw linksError;

  const sourceCourseIds: string[] = [
    ...new Set(
      (links ?? [])
        .map((link) => link.source_course_id)
        .filter((id) => Boolean(id) && id !== courseId)
    ),
  ];


  // Include both local content and approved shared source content.
  const courseIds = [
    ...new Set([courseId, ...sourceCourseIds]),
  ];

  const { data, error } = await supabase
    .from("course_topics")
    .select("*")
    .in("course_id", courseIds)
    .order("display_order");

  if (error) throw error;

  // Deduplicate by the actual topic ID, never by title.
  // Different topics can legitimately have the same title.
  const uniqueTopics = new Map<string, CourseTopic>();

  for (const topic of data ?? []) {
    uniqueTopics.set(topic.id, topic as CourseTopic);
  }

  return [...uniqueTopics.values()];
}

/**
 * Retrieves a single topic by its original ID.
 */
export async function getTopicById(
  topicId: string
): Promise<CourseTopic | null> {
  const { data, error } = await supabase
    .from("course_topics")
    .select("*")
    .eq("id", topicId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/**
 * Retrieves lessons for a topic.
 * Shared topics use their original topic IDs, so no lesson copying
 * or separate shared-lesson lookup is required.
 */
export async function getTopicLessons(
  topicId: string
): Promise<Lesson[]> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("topic_id", topicId)
    .order("display_order");

  if (error) throw error;

  return data ?? [];
}

/**
 * Retrieves a single lesson by its original ID.
 */
export async function getLessonById(
  lessonId: string
): Promise<Lesson | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/**
 * Retrieves the previous and next lessons within the same topic.
 */
export async function getAdjacentLessons(
  topicId: string,
  currentDisplayOrder: number
): Promise<{
  previous: Lesson | null;
  next: Lesson | null;
}> {
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

  return {
    previous: prevResult.data,
    next: nextResult.data,
  };
}

/**
 * Retrieves published materials attached to a lesson, including
 * associated file metadata.
 *
 * This returns metadata only. Download links should be generated
 * separately using signed Supabase Storage URLs when needed.
 */
export async function getLessonMaterials(
  lessonId: string
): Promise<MaterialWithFile[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("*, file:files(*)")
    .eq("lesson_id", lessonId)
    .eq("status", "published");

  if (error) throw error;

  return (data ?? []) as unknown as MaterialWithFile[];
}
