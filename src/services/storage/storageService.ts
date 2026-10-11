import { supabase } from "@/services/supabase/client";
import { logAuditEvent } from "@/services/audit/auditService";
import type { FileRecord } from "@/types/database.types";

/**
 * Thin wrapper around Supabase Storage + the `files` metadata table
 * (see 010_notifications_files.sql / 015_storage_buckets.sql). Every
 * upload does two things in sequence: put the bytes in Storage, then
 * record the metadata row — callers (e.g. adminContentService's material
 * creation flow) attach that row's id to whatever it belongs to
 * (materials.file_id, etc).
 *
 * Path convention (see 015_storage_buckets.sql's header comment):
 *   materials/{lesson_id}/{timestamp}-{filename}
 * Namespacing by lesson_id keeps uploads for different lessons from
 * colliding and makes "everything for this lesson" easy to reason about,
 * without needing a database query to figure out where to write.
 */

const MATERIALS_BUCKET = "materials";

function buildMaterialPath(lessonId: string, filename: string): string {
  const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  return `${lessonId}/${Date.now()}-${safeName}`;
}

export async function uploadMaterialFile(lessonId: string, file: File): Promise<FileRecord> {
  const path = buildMaterialPath(lessonId, file.name);

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Not signed in.");

  const { error: uploadError } = await supabase.storage.from(MATERIALS_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data, error: insertError } = await supabase
    .from("files")
    .insert({
      storage_bucket: MATERIALS_BUCKET,
      storage_path: path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      visibility: "private",
      uploaded_by: userData.user.id,
      related_type: "material",
    })
    .select()
    .single();

  if (insertError) {
    // Best-effort cleanup so a failed metadata insert doesn't leave an
    // orphaned object with nothing pointing at it.
    await supabase.storage.from(MATERIALS_BUCKET).remove([path]);
    throw insertError;
  }

  await logAuditEvent("file.uploaded", "file", data.id, { bucket: MATERIALS_BUCKET, filename: file.name });
  return data;
}

export async function deleteMaterialFile(file: FileRecord): Promise<void> {
  const { error: storageError } = await supabase.storage.from(file.storage_bucket).remove([file.storage_path]);
  if (storageError) throw storageError;

  const { error: dbError } = await supabase.from("files").delete().eq("id", file.id);
  if (dbError) throw dbError;

  await logAuditEvent("file.deleted", "file", file.id, { bucket: file.storage_bucket, filename: file.filename });
}

/** Time-limited download URL — generated on demand, never cached in a
 * list fetch (see the note on getLessonMaterials in coursesService.ts). */
export async function getSignedUrl(file: Pick<FileRecord, "storage_bucket" | "storage_path">, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, expiresInSeconds);
  if (error || !data) throw error ?? new Error("No signed URL returned");
  return data.signedUrl;
}
