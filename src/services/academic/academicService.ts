import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type {
  AcademicSession,
  Department,
  Faculty,
  Institution,
  Level,
  Profile,
  Programme,
  Semester,
} from "@/types/database.types";

/**
 * Read access to the academic hierarchy (institutions -> ... -> semesters)
 * and the "change current academic context" write path.
 *
 * Every list function here is a thin, cascading, parent-scoped query —
 * `listFaculties(institutionId)` only ever returns faculties belonging to
 * that institution, `listDepartments(facultyId)` only that faculty's
 * departments, and so on — which is what lets the onboarding and
 * "Change Academic Context" UIs implement the "selecting a parent narrows
 * the child dropdown" behavior the Master Specification requires, driven
 * entirely by real Supabase queries rather than a hardcoded map.
 *
 * The actual "is this combination even valid" guarantee is NOT this
 * file's job — it is enforced in the database by
 * validate_profile_academic_context() (see
 * supabase/migrations/004_academic_structure.sql), so a bug here can
 * produce a confusing form, but never a corrupt profile row.
 */

export async function listInstitutions(): Promise<Institution[]> {
  const { data, error } = await supabase
    .from("institutions")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listFaculties(institutionId: string): Promise<Faculty[]> {
  const { data, error } = await supabase
    .from("faculties")
    .select("*")
    .eq("institution_id", institutionId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listDepartments(facultyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("faculty_id", facultyId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listProgrammes(departmentId: string): Promise<Programme[]> {
  const { data, error } = await supabase
    .from("programmes")
    .select("*")
    .eq("department_id", departmentId)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listLevels(programmeId: string): Promise<Level[]> {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("programme_id", programmeId)
    .eq("is_active", true)
    .order("numeric_value");
  if (error) throw error;
  return data ?? [];
}

export async function listAcademicSessions(institutionId: string): Promise<AcademicSession[]> {
  const { data, error } = await supabase
    .from("academic_sessions")
    .select("*")
    .eq("institution_id", institutionId)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSemesters(academicSessionId: string): Promise<Semester[]> {
  const { data, error } = await supabase
    .from("semesters")
    .select("*")
    .eq("academic_session_id", academicSessionId)
    .order("numeric_value");
  if (error) throw error;
  return data ?? [];
}

export interface AcademicContext {
  institutionId: string;
  facultyId: string;
  departmentId: string;
  programmeId: string;
  levelId: string;
  sessionId: string;
  semesterId: string;
}

/**
 * Used by BOTH the initial onboarding flow and the later "Settings ->
 * Academic Profile -> Change Academic Context" flow (Master Spec: a
 * student's account is permanent; only their current context changes).
 *
 * This does not touch course_enrollments, lesson_progress, or any other
 * historical table — see the design note on profiles in
 * 004_academic_structure.sql. Auto-enrolling the student into the new
 * context's course offerings (Master Spec: "the system may create or
 * update the student's current enrollments as appropriate") is intentionally
 * left to the Phase 4 student-dashboard work; this function's contract is
 * just "update where I currently am," which the Courses page then reads
 * to decide what to show (see coursesService.getCourseOfferingsForContext).
 */
export async function updateCurrentAcademicContext(
  userId: string,
  context: AcademicContext
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .update({
      institution_id: context.institutionId,
      faculty_id: context.facultyId,
      department_id: context.departmentId,
      programme_id: context.programmeId,
      level_id: context.levelId,
      current_session_id: context.sessionId,
      current_semester_id: context.semesterId,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// ========================================================================
// ADMIN CRUD (Phase 3) — Master Spec sections 19-27, 96
// ========================================================================
// Every mutation below logs to admin_audit_logs (see services/audit) right
// after it succeeds. RLS (012_rls.sql) independently restricts these
// tables to is_admin() for write access — these functions don't duplicate
// that check client-side; if a non-admin calls one, Supabase rejects the
// write and the function throws, same as any other RLS-denied query.

// ---- Institutions ----

export async function adminListInstitutions(): Promise<Institution[]> {
  const { data, error } = await supabase.from("institutions").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createInstitution(input: {
  name: string;
  shortName?: string;
  country?: string;
  city?: string;
}): Promise<Institution> {
  const { data, error } = await supabase
    .from("institutions")
    .insert({ name: input.name, short_name: input.shortName, country: input.country, city: input.city })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("institution.created", "institution", data.id, { name: input.name });
  return data;
}

export async function updateInstitution(
  id: string,
  input: Partial<Pick<Institution, "name" | "short_name" | "country" | "city" | "is_active">>
): Promise<Institution> {
  const { data, error } = await supabase.from("institutions").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("institution.updated", "institution", id, input);
  return data;
}

export async function setInstitutionActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("institutions").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logAuditEvent(isActive ? "institution.restored" : "institution.archived", "institution", id);
}

// ---- Faculties ----

export async function adminListFaculties(institutionId: string): Promise<Faculty[]> {
  const { data, error } = await supabase
    .from("faculties")
    .select("*")
    .eq("institution_id", institutionId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createFaculty(input: { institutionId: string; name: string; code?: string }): Promise<Faculty> {
  const { data, error } = await supabase
    .from("faculties")
    .insert({ institution_id: input.institutionId, name: input.name, code: input.code })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("faculty.created", "faculty", data.id, { name: input.name });
  return data;
}

export async function updateFaculty(
  id: string,
  input: Partial<Pick<Faculty, "name" | "code" | "is_active">>
): Promise<Faculty> {
  const { data, error } = await supabase.from("faculties").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("faculty.updated", "faculty", id, input);
  return data;
}

export async function setFacultyActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("faculties").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logAuditEvent(isActive ? "faculty.restored" : "faculty.archived", "faculty", id);
}

// ---- Departments ----

export async function adminListDepartments(facultyId: string): Promise<Department[]> {
  const { data, error } = await supabase.from("departments").select("*").eq("faculty_id", facultyId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createDepartment(input: { facultyId: string; name: string; code?: string }): Promise<Department> {
  const { data, error } = await supabase
    .from("departments")
    .insert({ faculty_id: input.facultyId, name: input.name, code: input.code })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("department.created", "department", data.id, { name: input.name });
  return data;
}

export async function updateDepartment(
  id: string,
  input: Partial<Pick<Department, "name" | "code" | "is_active">>
): Promise<Department> {
  const { data, error } = await supabase.from("departments").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("department.updated", "department", id, input);
  return data;
}

export async function setDepartmentActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("departments").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logAuditEvent(isActive ? "department.restored" : "department.archived", "department", id);
}

// ---- Programmes ----

export async function adminListProgrammes(departmentId: string): Promise<Programme[]> {
  const { data, error } = await supabase.from("programmes").select("*").eq("department_id", departmentId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createProgramme(input: {
  departmentId: string;
  name: string;
  code?: string;
  degreeType?: string;
  durationYears?: number;
}): Promise<Programme> {
  const { data, error } = await supabase
    .from("programmes")
    .insert({
      department_id: input.departmentId,
      name: input.name,
      code: input.code,
      degree_type: input.degreeType,
      duration_years: input.durationYears ?? 4,
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("programme.created", "programme", data.id, { name: input.name });
  return data;
}

export async function updateProgramme(
  id: string,
  input: Partial<Pick<Programme, "name" | "code" | "degree_type" | "duration_years" | "is_active">>
): Promise<Programme> {
  const { data, error } = await supabase.from("programmes").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("programme.updated", "programme", id, input);
  return data;
}

export async function setProgrammeActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("programmes").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logAuditEvent(isActive ? "programme.restored" : "programme.archived", "programme", id);
}

// ---- Levels ----

export async function adminListLevels(programmeId: string): Promise<Level[]> {
  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("programme_id", programmeId)
    .order("numeric_value");
  if (error) throw error;
  return data ?? [];
}

export async function createLevel(input: { programmeId: string; name: string; numericValue: number }): Promise<Level> {
  const { data, error } = await supabase
    .from("levels")
    .insert({ programme_id: input.programmeId, name: input.name, numeric_value: input.numericValue })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("level.created", "level", data.id, { name: input.name });
  return data;
}

export async function updateLevel(
  id: string,
  input: Partial<Pick<Level, "name" | "numeric_value" | "is_active">>
): Promise<Level> {
  const { data, error } = await supabase.from("levels").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("level.updated", "level", id, input);
  return data;
}

export async function setLevelActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from("levels").update({ is_active: isActive }).eq("id", id);
  if (error) throw error;
  await logAuditEvent(isActive ? "level.restored" : "level.archived", "level", id);
}

// ---- Academic sessions ----

export async function createAcademicSession(input: {
  institutionId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
}): Promise<AcademicSession> {
  const { data, error } = await supabase
    .from("academic_sessions")
    .insert({
      institution_id: input.institutionId,
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
      is_current: input.isCurrent ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("academic_session.created", "academic_session", data.id, { name: input.name });
  return data;
}

export async function updateAcademicSession(
  id: string,
  input: Partial<Pick<AcademicSession, "name" | "start_date" | "end_date" | "is_current">>
): Promise<AcademicSession> {
  const { data, error } = await supabase.from("academic_sessions").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("academic_session.updated", "academic_session", id, input);
  return data;
}

// ---- Semesters ----

export async function createSemester(input: {
  academicSessionId: string;
  name: string;
  numericValue: number;
  startDate?: string;
  endDate?: string;
}): Promise<Semester> {
  const { data, error } = await supabase
    .from("semesters")
    .insert({
      academic_session_id: input.academicSessionId,
      name: input.name,
      numeric_value: input.numericValue,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("semester.created", "semester", data.id, { name: input.name });
  return data;
}

export async function updateSemester(
  id: string,
  input: Partial<Pick<Semester, "name" | "numeric_value" | "start_date" | "end_date">>
): Promise<Semester> {
  const { data, error } = await supabase.from("semesters").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent("semester.updated", "semester", id, input);
  return data;
}
