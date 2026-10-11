import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import { uploadMaterialFile, deleteMaterialFile } from "@/services/storage/storageService";
import type { ContentStatus, CourseTopic, Lesson, MaterialWithFile } from "@/types/database.types";

/**
 * Admin CRUD for Topics and Lessons (Master Spec sections 26, 27).
 * Attached to the reusable `courses`/`course_topics` rows, not to a
 * specific course_offering — see the design note at the top of
 * `supabase/migrations/004_academic_structure.sql`. RLS restricts writes
 * to is_staff().
 */

// ---- Topics ----

export async function adminListTopics(courseId: string): Promise<CourseTopic[]> {
  const { data, error } = await supabase
    .from("course_topics")
    .select("*")
    .eq("course_id", courseId)
    .order("display_order");
  if (error) throw error;
  return data ?? [];
}

export async function createTopic(input: {
  courseId: string;
  title: string;
  description?: string;
  displayOrder?: number;
}): Promise<CourseTopic> {
  const { data, error } = await supabase
    .from("course_topics")
    .insert({
      course_id: input.courseId,
      title: input.title,
      description: input.description,
      display_order: input.displayOrder ?? 0,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("topic.created", "course_topic", data.id, { title: input.title });
  return data;
}

export async function updateTopic(
  id: string,
  input: Partial<Pick<CourseTopic, "title" | "description" | "display_order" | "status">>
): Promise<CourseTopic> {
  const { data, error } = await supabase.from("course_topics").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent(input.status ? "topic.status_changed" : "topic.updated", "course_topic", id, input);
  return data;
}

// ---- Lessons ----

export async function adminListLessons(topicId: string): Promise<Lesson[]> {
  const { data, error } = await supabase.from("lessons").select("*").eq("topic_id", topicId).order("display_order");
  if (error) throw error;
  return data ?? [];
}

export interface LessonInput {
  topicId: string;
  title: string;
  introduction?: string;
  coreConcept?: string;
  detailedExplanation?: string;
  examples?: string;
  formulas?: string;
  notes?: string;
  estimatedReadingMinutes?: number;
  displayOrder?: number;
}

export async function createLesson(input: LessonInput): Promise<Lesson> {
  const { data, error } = await supabase
    .from("lessons")
    .insert({
      topic_id: input.topicId,
      title: input.title,
      introduction: input.introduction,
      core_concept: input.coreConcept,
      detailed_explanation: input.detailedExplanation,
      examples: input.examples,
      formulas: input.formulas,
      notes: input.notes,
      estimated_reading_minutes: input.estimatedReadingMinutes,
      display_order: input.displayOrder ?? 0,
      status: "draft",
      additional_resources: [],
    })
    .select()
    .single();
  if (error) throw error;
  await logAuditEvent("lesson.created", "lesson", data.id, { title: input.title });
  return data;
}

export async function updateLesson(
  id: string,
  input: Partial<
    Pick<
      Lesson,
      | "title"
      | "introduction"
      | "core_concept"
      | "detailed_explanation"
      | "examples"
      | "formulas"
      | "notes"
      | "estimated_reading_minutes"
      | "display_order"
      | "status"
    >
  >
): Promise<Lesson> {
  const { data, error } = await supabase.from("lessons").update(input).eq("id", id).select().single();
  if (error) throw error;
  await logAuditEvent(input.status ? "lesson.status_changed" : "lesson.updated", "lesson", id, input);
  return data;
}

export const CONTENT_STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// ---- Materials (Phase 4 completion) ----

export async function adminListMaterialsForLesson(lessonId: string): Promise<MaterialWithFile[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("*, file:files(*)")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MaterialWithFile[];
}

/**
 * Uploads the file to Storage (see services/storage/storageService.ts —
 * this is what migration 015's `materials` bucket exists for), then
 * creates the `materials` row pointing at it. Two writes, not one
 * transaction — if the second write fails, storageService's own
 * best-effort cleanup removes the now-orphaned Storage object.
 */
export async function createMaterialWithUpload(input: {
  lessonId: string;
  title: string;
  description?: string;
  file: File;
}): Promise<MaterialWithFile> {
  const fileRow = await uploadMaterialFile(input.lessonId, input.file);

  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("materials")
    .insert({
      lesson_id: input.lessonId,
      title: input.title,
      description: input.description,
      file_id: fileRow.id,
      status: "draft",
      uploaded_by: userData.user?.id ?? null,
    })
    .select("*, file:files(*)")
    .single();

  if (error) {
    // The file/Storage object uploaded successfully but the materials row
    // didn't — clean up so we don't leave an orphaned file with nothing
    // pointing at it (same reasoning as the cleanup inside
    // uploadMaterialFile itself for its own insert step).
    await deleteMaterialFile(fileRow).catch(() => {
      // Best-effort: if this also fails, the original `error` below is
      // still the one surfaced to the caller — an orphaned file is a
      // cleanup task, not a reason to hide the real failure.
    });
    throw error;
  }
  await logAuditEvent("material.created", "material", data.id, { title: input.title, filename: input.file.name });
  return data as unknown as MaterialWithFile;
}

export async function updateMaterialStatus(id: string, status: ContentStatus): Promise<void> {
  const { error } = await supabase.from("materials").update({ status }).eq("id", id);
  if (error) throw error;
  await logAuditEvent("material.status_changed", "material", id, { status });
}

/** Deletes both the materials row and its underlying file/Storage object.
 * Deliberately a hard delete (unlike content tables, which prefer
 * archiving) — a material with no file behind it is just clutter, not
 * historical record worth preserving (Master Spec section 98 is about
 * not destroying *results*, not every uploaded PDF). */
export async function deleteMaterial(material: MaterialWithFile): Promise<void> {
  const { error } = await supabase.from("materials").delete().eq("id", material.id);
  if (error) throw error;
  if (material.file) {
    await deleteMaterialFile(material.file);
  }
  await logAuditEvent("material.deleted", "material", material.id, { title: material.title });
}
