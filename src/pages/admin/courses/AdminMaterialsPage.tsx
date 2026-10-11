import { useEffect, useState } from "react";
import { Plus, Download, Trash2 } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { listInstitutions, listFaculties, listDepartments } from "@/services/academic/academicService";
import { adminListCourses } from "@/services/courses/adminCoursesService";
import { adminListTopics, adminListLessons } from "@/services/courses/adminContentService";
import {
  adminListMaterialsForLesson,
  createMaterialWithUpload,
  updateMaterialStatus,
  deleteMaterial,
} from "@/services/courses/adminContentService";
import { getSignedUrl } from "@/services/storage/storageService";
import type { ContentStatus, Course, CourseTopic, Department, Faculty, Institution, Lesson, MaterialWithFile } from "@/types/database.types";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/**
 * Institution -> Faculty -> Department -> Course -> Topic -> Lesson ->
 * manage Materials (Master Spec section 28). This is the piece that was
 * left as `ComingSoonPage` in the initial Phase 4 pass, blocked on having
 * a Storage bucket to upload into — migration 015 creates the `materials`
 * bucket and its RLS, and services/storage/storageService.ts does the
 * actual upload, so this page is now real end to end: pick a file, it
 * uploads to Storage, a `files` row and a `materials` row are created,
 * and the material appears in the list immediately.
 */
export function AdminMaterialsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonId, setLessonId] = useState("");

  const [materials, setMaterials] = useState<MaterialWithFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleting, setDeleting] = useState<MaterialWithFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setFacultyId(""); setFaculties([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId(""); setDepartments([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);
  useEffect(() => {
    setCourseId(""); setCourses([]);
    if (departmentId) adminListCourses(departmentId).then(setCourses).catch(() => showToast("Couldn't load courses.", "error"));
  }, [departmentId, showToast]);
  useEffect(() => {
    setTopicId(""); setTopics([]);
    if (courseId) adminListTopics(courseId).then(setTopics).catch(() => showToast("Couldn't load topics.", "error"));
  }, [courseId, showToast]);
  useEffect(() => {
    setLessonId(""); setLessons([]);
    if (topicId) adminListLessons(topicId).then(setLessons).catch(() => showToast("Couldn't load lessons.", "error"));
  }, [topicId, showToast]);

  async function refresh(lId: string) {
    setIsLoading(true);
    try {
      setMaterials(await adminListMaterialsForLesson(lId));
    } catch {
      showToast("Couldn't load materials.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (lessonId) refresh(lessonId);
    else setMaterials([]);
  }, [lessonId]);

  function openCreate() {
    setTitle("");
    setDescription("");
    setFile(null);
    setIsCreateOpen(true);
  }

  async function handleUpload() {
    if (!lessonId || !file || !title) return;
    setIsUploading(true);
    try {
      await createMaterialWithUpload({ lessonId, title, description, file });
      showToast("Material uploaded.", "success");
      setIsCreateOpen(false);
      await refresh(lessonId);
    } catch {
      showToast("Couldn't upload that file.", "error");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleStatusChange(id: string, status: ContentStatus) {
    try {
      await updateMaterialStatus(id, status);
      showToast("Status updated.", "success");
      await refresh(lessonId);
    } catch {
      showToast("Couldn't update status.", "error");
    }
  }

  async function handleDownload(material: MaterialWithFile) {
    if (!material.file) return;
    try {
      const url = await getSignedUrl(material.file, 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      showToast("Couldn't open that file.", "error");
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await deleteMaterial(deleting);
      showToast("Material deleted.", "success");
      setDeleting(null);
      await refresh(lessonId);
    } catch {
      showToast("Couldn't delete that material.", "error");
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: DataTableColumn<MaterialWithFile>[] = [
    { key: "title", header: "Title", render: (r) => r.title, searchValue: (r) => r.title },
    { key: "filename", header: "File", render: (r) => r.file?.filename ?? "—" },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "status_change",
      header: "Change status",
      render: (r) => (
        <Select label={`Status for ${r.title}`} hideLabel value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as ContentStatus)} options={STATUS_OPTIONS} />
      ),
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Materials</h1>
      </div>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "160px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "160px" }}>
          <Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "160px" }}>
          <Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Course" placeholder="Select" value={courseId} onChange={(e) => setCourseId(e.target.value)} options={courses.map((c) => ({ value: c.id, label: c.course_code }))} disabled={!departmentId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Topic" placeholder="Select" value={topicId} onChange={(e) => setTopicId(e.target.value)} options={topics.map((t) => ({ value: t.id, label: t.title }))} disabled={!courseId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Lesson" placeholder="Select" value={lessonId} onChange={(e) => setLessonId(e.target.value)} options={lessons.map((l) => ({ value: l.id, label: l.title }))} disabled={!topicId} />
        </div>
      </div>

      {lessonId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> Upload material
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={materials}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search materials..."
            emptyTitle="No materials yet."
            actions={(r) => (
              <>
                <Button variant="ghost" size="sm" onClick={() => handleDownload(r)} disabled={!r.file} aria-label={`Download ${r.title}`}>
                  <Download size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.title}`}>
                  <Trash2 size={14} />
                </Button>
              </>
            )}
          />
        </>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Upload material">
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleUpload(); }}>
          <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }} htmlFor="material-file">
              File
            </label>
            <input
              id="material-file"
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}
            />
          </div>
          <Button type="submit" isLoading={isUploading} disabled={!file || !title}>
            Upload
          </Button>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete material?"
        description={`This permanently removes "${deleting?.title}" and its file. This can't be undone.`}
        confirmLabel="Delete"
        isDangerous
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
