
import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type {
  ContentStatus,
  Course,
  CourseOffering,
  CourseOfferingWithCourse,
} from "@/types/database.types";

// ============================================================================
// COURSE IDENTITY
// ============================================================================

/**
 * Admin CRUD for reusable course identities.
 *
 * Course content sharing is managed separately through
 * course_content_links. Linking courses does not copy their topics,
 * lessons, materials, or student progress.
 */

export async function adminListCourses(
  departmentId?: string
): Promise<Course[]> {
  let query = supabase
    .from("courses")
    .select("*")
    .order("course_code");

  if (departmentId) {
    query = query.eq("department_id", departmentId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data ?? [];
}

export async function createCourse(input: {
  courseCode: string;
  title: string;
  description?: string;
  creditUnits?: number;
  courseType?: string;
  departmentId?: string;
}): Promise<Course> {
  const { data, error } = await supabase
    .from("courses")
    .insert({
      course_code: input.courseCode,
      title: input.title,
      description: input.description,
      credit_units: input.creditUnits ?? 0,
      course_type: input.courseType,
      department_id: input.departmentId,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent("course.created", "course", data.id, {
    course_code: input.courseCode,
  });

  return data;
}

export async function updateCourse(
  id: string,
  input: Partial<
    Pick<
      Course,
      | "title"
      | "description"
      | "credit_units"
      | "course_type"
      | "status"
    >
  >
): Promise<Course> {
  const { data, error } = await supabase
    .from("courses")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    input.status ? "course.status_changed" : "course.updated",
    "course",
    id,
    input
  );

  return data;
}

// ============================================================================
// SHARED COURSE CONTENT LINKS
// ============================================================================

export type CourseContentLinkStatus =
  | "pending"
  | "approved"
  | "rejected";

export interface CourseContentLink {
  id: string;
  source_course_id: string;
  linked_course_id: string;
  status: CourseContentLinkStatus;
  created_at: string;
  created_by: string | null;
}

export interface CreateCourseContentLinkInput {
  sourceCourseId: string;
  linkedCourseId: string;
  status?: CourseContentLinkStatus;
}

/**
 * Lists content links for a canonical source course.
 *
 * source_course_id is the course whose topics and lessons are reused.
 * linked_course_id is the course that consumes that shared content.
 */
export async function adminListCourseContentLinks(
    sourceCourseId ? : string
  ): Promise < CourseContentLink[] > {
    let query = supabase
      .from("course_content_links")
      .select("*")
      .order("created_at", { ascending: false });

  if (sourceCourseId) {
    query = query.eq("source_course_id", sourceCourseId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as CourseContentLink[];
}

/**
 * Lists approved and unapproved links where a course is either
 * the canonical source or the consuming course.
 */
export async function adminListCourseContentLinksForCourse(
    courseId: string
  ): Promise < CourseContentLink[] > {
    const { data, error } = await supabase
    .from("course_content_links")
    .select("*")
    .or(
      `source_course_id.eq.${courseId},linked_course_id.eq.${courseId}`
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as CourseContentLink[];
}

/**
 * Creates a shared-content link.
 *
 * The database validates that both courses belong to the same
 * institution and enforces uniqueness and staff permissions.
 *
 * Links default to pending so a proposed match cannot automatically
 * expose content before it has been reviewed and approved.
 */
export async function createCourseContentLink(
  input: CreateCourseContentLinkInput
): Promise<CourseContentLink> {
  if (input.sourceCourseId === input.linkedCourseId) {
    throw new Error("A course cannot share content with itself.");
  }

const { data, error } = await supabase
  .from("course_content_links")
  .insert({
    source_course_id: input.sourceCourseId,
    linked_course_id: input.linkedCourseId,
    status: input.status ?? "pending",
  })
  .select("*")
  .single();

  if (error) throw error;

  await logAuditEvent(
    "course_content_link.created",
    "course_content_link",
    data.id,
    {
      source_course_id: input.sourceCourseId,
      linked_course_id: input.linkedCourseId,
      status: data.status,
    }
  );

  return data as CourseContentLink;
}

/**
 * Updates a link's review status.
 *
 * Approving a link allows the consuming course to use content from
 * the canonical source, subject to the database's RLS policies.
 */
export async function updateCourseContentLinkStatus(
    id: string,
    status: CourseContentLinkStatus
  ): Promise < CourseContentLink > {
    const { data, error } = await supabase
    .from("course_content_links")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  await logAuditEvent(
    "course_content_link.status_changed",
    "course_content_link",
    id,
    { status }
  );

  return data as CourseContentLink;
}

/**
 * Removes a shared-content link.
 *
 * This deletes only the relationship, not the courses, topics, lessons,
 * materials, enrollments, or student progress.
 */
export async function deleteCourseContentLink(
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("course_content_links")
    .delete()
    .eq("id", id);

  if (error) throw error;

  await logAuditEvent(
    "course_content_link.deleted",
    "course_content_link",
    id,
    {}
  );
}

// ============================================================================
// COURSE OFFERINGS
// ============================================================================

export interface CourseOfferingFilters {
  institutionId?: string;
  programmeId?: string;
  levelId?: string;
  semesterId?: string;
  status?: ContentStatus;
}

/**
 * Filterable admin view of course offerings.
 */
export async function adminListCourseOfferings(
  filters: CourseOfferingFilters
): Promise<CourseOfferingWithCourse[]> {
  let query = supabase
    .from("course_offerings")
    .select("*, course:courses(*)")
    .order("created_at", { ascending: false });

  if (filters.institutionId) {
    query = query.eq("institution_id", filters.institutionId);
  }

  if (filters.programmeId) {
    query = query.eq("programme_id", filters.programmeId);
  }

  if (filters.levelId) {
    query = query.eq("level_id", filters.levelId);
  }

  if (filters.semesterId) {
    query = query.eq("semester_id", filters.semesterId);
  }

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as unknown as CourseOfferingWithCourse[];
}

export async function createCourseOffering(input: {
  courseId: string;
  institutionId: string;
  programmeId: string;
  levelId: string;
  semesterId: string;
  capacity?: number;
}): Promise<CourseOffering> {
  const { data, error } = await supabase
    .from("course_offerings")
    .insert({
      course_id: input.courseId,
      institution_id: input.institutionId,
      programme_id: input.programmeId,
      level_id: input.levelId,
      semester_id: input.semesterId,
      capacity: input.capacity,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    "course_offering.created",
    "course_offering",
    data.id,
    {
      course_id: input.courseId,
      programme_id: input.programmeId,
      level_id: input.levelId,
      semester_id: input.semesterId,
    }
  );

  return data;
}

export async function updateCourseOfferingStatus(
  id: string,
  status: ContentStatus
): Promise<CourseOffering> {
  const { data, error } = await supabase
    .from("course_offerings")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    "course_offering.status_changed",
    "course_offering",
    id,
    { status }
  );

  return data;
}
