
import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import {
  uploadMaterialFile,
  deleteMaterialFile,
} from "@/services/storage/storageService";
import type {
  ContentStatus,
  CourseTopic,
  Lesson,
  MaterialWithFile,
} from "@/types/database.types";

// ============================================================================
// TOPICS
// ============================================================================

/**
 * Lists the selected course's own topics plus topics from approved
 * canonical source courses linked to it.
 *
 * Shared topics retain their original IDs. Editing one of these topics
 * updates the canonical topic rather than creating a copy.
 *
 * Creating a new topic still attaches it to the selected course,
 * preserving the ability to add department-specific content.
 */
export async function adminListTopics(
    courseId: string
  ): Promise < CourseTopic[] > {
    const { data: links, error: linksError } = await supabase
    .from("course_content_links")
    .select("source_course_id")
    .eq("linked_course_id", courseId)
    .eq("status", "approved");

  if (linksError) throw linksError;

  const sourceCourseIds: string[] = [
    ...new Set(
      (links ?? [])
        .map(
          (link: { source_course_id: string }) =>
            link.source_course_id
        )
        .filter(
          (id: string) => Boolean(id) && id !== courseId
        )
    ),
  ];

  const courseIds = [
    ...new Set([courseId, ...sourceCourseIds]),
  ];

  const { data, error } = await supabase
    .from("course_topics")
    .select("*")
    .in("course_id", courseIds)
    .order("display_order");

  if (error) throw error;

  // Deduplicate by topic ID, not title.
  const uniqueTopics = new Map<string, CourseTopic>();

  for (const topic of data ?? []) {
    uniqueTopics.set(topic.id, topic as CourseTopic);
  }

  return [...uniqueTopics.values()];
}

/**
 * Creates a new topic owned by the selected course.
 * Shared content is never copied automatically.
 */
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

  await logAuditEvent(
    "topic.created",
    "course_topic",
    data.id,
    {
      title: input.title,
      course_id: input.courseId,
    }
  );

  return data;
}

/**
 * Updates a topic by its original ID.
 *
 * When this is a shared topic, the canonical topic is updated.
 */
export async function updateTopic(
  id: string,
  input: Partial<
    Pick<
      CourseTopic,
      "title" | "description" | "display_order" | "status"
    >
  >
): Promise<CourseTopic> {
  const { data, error } = await supabase
    .from("course_topics")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    input.status ? "topic.status_changed" : "topic.updated",
    "course_topic",
    id,
    input
  );

  return data;
}

// ============================================================================
// LESSONS
// ============================================================================

/**
 * Lists lessons belonging to a topic.
 *
 * For shared topics, topicId is the original canonical topic ID,
 * so this returns the canonical lessons without duplicating them.
 */
export async function adminListLessons(
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

/**
 * Creates a lesson under the specified topic.
 *
 * If the topic is shared, this creates the lesson under that original
 * shared topic. If the topic is local, the lesson remains local.
 */
export async function createLesson(
  input: LessonInput
): Promise<Lesson> {
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
      estimated_reading_minutes:
        input.estimatedReadingMinutes,
      display_order: input.displayOrder ?? 0,
      status: "draft",
      additional_resources: [],
    })
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    "lesson.created",
    "lesson",
    data.id,
    {
      title: input.title,
      topic_id: input.topicId,
    }
  );

  return data;
}

/**
 * Updates a lesson by its original ID.
 *
 * Editing a lesson in shared content updates the canonical lesson
 * and therefore affects every course that consumes that source.
 */
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
  const { data, error } = await supabase
    .from("lessons")
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  await logAuditEvent(
    input.status ? "lesson.status_changed" : "lesson.updated",
    "lesson",
    id,
    input
  );

  return data;
}

export const CONTENT_STATUS_OPTIONS: {
  value: ContentStatus;
  label: string;
}[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

// ============================================================================
// MATERIALS
// ============================================================================

/**
 * Lists materials attached to a lesson.
 *
 * Shared lessons keep their original IDs, so their existing materials
 * remain attached to the same lesson.
 */
export async function adminListMaterialsForLesson(
  lessonId: string
): Promise<MaterialWithFile[]> {
  const { data, error } = await supabase
    .from("materials")
    .select("*, file:files(*)")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as unknown as MaterialWithFile[];
}

/**
 * Uploads a file and creates its materials record.
 * If creating the record fails, attempts to clean up the uploaded file.
 */
export async function createMaterialWithUpload(input: {
  lessonId: string;
  title: string;
  description?: string;
  file: File;
}): Promise<MaterialWithFile> {
  const fileRow = await uploadMaterialFile(
    input.lessonId,
    input.file
  );

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
    await deleteMaterialFile(fileRow).catch(() => {
      // Preserve the original database error if cleanup also fails.
    });

    throw error;
  }

  await logAuditEvent(
    "material.created",
    "material",
    data.id,
    {
      title: input.title,
      filename: input.file.name,
    }
  );

  return data as unknown as MaterialWithFile;
}

export async function updateMaterialStatus(
  id: string,
  status: ContentStatus
): Promise<void> {
  const { error } = await supabase
    .from("materials")
    .update({ status })
    .eq("id", id);

  if (error) throw error;

  await logAuditEvent(
    "material.status_changed",
    "material",
    id,
    { status }
  );
}

/**
 * Deletes the material record and then attempts to remove its file.
 *
 * Note: this remains a hard delete, matching the existing service.
 */
export async function deleteMaterial(
  material: MaterialWithFile
): Promise<void> {
  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", material.id);

  if (error) throw error;

  if (material.file) {
    await deleteMaterialFile(material.file);
  }

  await logAuditEvent(
    "material.deleted",
    "material",
    material.id,
    { title: material.title }
  );
}
