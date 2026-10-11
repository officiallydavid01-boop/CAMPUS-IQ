import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type { ContentStatus, Course, CourseOffering, CourseOfferingWithCourse } from "@/types/database.types";

/**
 * Admin CRUD for courses (reusable identity) and course_offerings
 * (specific institution/programme/level/semester delivery) — Master Spec
 * sections 24, 96, and the "IMPORTANT CLARIFICATION" on level+semester
 * specific course assignment. RLS (`012_rls.sql`) restricts writes here to
 * is_staff(); the database triggers in `004_academic_structure.sql`
 * (`validate_course_offering_context`) are the actual, authoritative
 * guard against saving an offering whose programme/level/semester don't
 * chain to its institution — this service does not re-implement that
 * check, it just surfaces whatever error Postgres raises.
 */

export async function adminListCourses(departmentId?: string): Promise<Course[]> {
  let query = supabase.from("courses").select("*").order("course_code");
  if (departmentId) query = query.eq("department_id", departmentId);
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
  await logAuditEvent("course.created", "course", data.id, { course_code: input.courseCode });
  return data;
}

export async function updateCourse(
  id: string,
  input: Partial<Pick<Course, "title" | "description" | "credit_units" | "course_type" | "status">>
): Promise<Course> {
  const { data, error } = await supabase.from("courses").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent(
    input.status ? `course.status_changed` : "course.updated",
    "course",
    id,
    input
  );
  return data;
}

// ---- Course offerings ----

export interface CourseOfferingFilters {
  institutionId?: string;
  programmeId?: string;
  levelId?: string;
  semesterId?: string;
  status?: ContentStatus;
}

/** Admin's filterable view of course offerings — the write side of the
 * same table the student-facing `getCourseOfferingsForContext` reads
 * (see services/courses/coursesService.ts), filtered by whichever of the
 * five dimensions the Admin has picked rather than requiring all four. */
export async function adminListCourseOfferings(filters: CourseOfferingFilters): Promise<CourseOfferingWithCourse[]> {
  let query = supabase.from("course_offerings").select("*, course:courses(*)").order("created_at", { ascending: false });

  if (filters.institutionId) query = query.eq("institution_id", filters.institutionId);
  if (filters.programmeId) query = query.eq("programme_id", filters.programmeId);
  if (filters.levelId) query = query.eq("level_id", filters.levelId);
  if (filters.semesterId) query = query.eq("semester_id", filters.semesterId);
  if (filters.status) query = query.eq("status", filters.status);

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
  await logAuditEvent("course_offering.created", "course_offering", data.id, {
    course_id: input.courseId,
    programme_id: input.programmeId,
    level_id: input.levelId,
    semester_id: input.semesterId,
  });
  return data;
}

export async function updateCourseOfferingStatus(id: string, status: ContentStatus): Promise<CourseOffering> {
  const { data, error } = await supabase
    .from("course_offerings")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("course_offering.status_changed", "course_offering", id, { status });
  return data;
}
