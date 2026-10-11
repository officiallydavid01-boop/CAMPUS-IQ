import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { listInstitutions, listFaculties, listDepartments } from "@/services/academic/academicService";
import { adminListCourses } from "@/services/courses/adminCoursesService";
import { adminListTopics } from "@/services/courses/adminContentService";
import {
  adminListLessons,
  createLesson,
  updateLesson,
  CONTENT_STATUS_OPTIONS,
  type LessonInput,
} from "@/services/courses/adminContentService";
import type { ContentStatus, Course, CourseTopic, Department, Faculty, Institution, Lesson } from "@/types/database.types";

const emptyForm = {
  title: "",
  introduction: "",
  coreConcept: "",
  detailedExplanation: "",
  examples: "",
  formulas: "",
  notes: "",
  estimatedReadingMinutes: 5,
  displayOrder: 0,
  status: "draft" as ContentStatus,
};

/** Institution -> Faculty -> Department -> Course -> Topic -> manage
 * Lessons (Master Spec section 27's full lesson-editor field set). */
export function AdminLessonsPage() {
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
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Lesson | "new" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

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

  async function refresh(tId: string) {
    setIsLoading(true);
    try {
      setLessons(await adminListLessons(tId));
    } catch {
      showToast("Couldn't load lessons.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (topicId) refresh(topicId);
    else setLessons([]);
  }, [topicId]);

  function openCreate() {
    setForm({ ...emptyForm, displayOrder: lessons.length });
    setEditing("new");
  }
  function openEdit(l: Lesson) {
    setForm({
      title: l.title,
      introduction: l.introduction ?? "",
      coreConcept: l.core_concept ?? "",
      detailedExplanation: l.detailed_explanation ?? "",
      examples: l.examples ?? "",
      formulas: l.formulas ?? "",
      notes: l.notes ?? "",
      estimatedReadingMinutes: l.estimated_reading_minutes ?? 5,
      displayOrder: l.display_order,
      status: l.status,
    });
    setEditing(l);
  }

  async function handleSave() {
    if (!topicId) return;
    setIsSaving(true);
    try {
      const payload: LessonInput = {
        topicId,
        title: form.title,
        introduction: form.introduction,
        coreConcept: form.coreConcept,
        detailedExplanation: form.detailedExplanation,
        examples: form.examples,
        formulas: form.formulas,
        notes: form.notes,
        estimatedReadingMinutes: form.estimatedReadingMinutes,
        displayOrder: form.displayOrder,
      };
      if (editing === "new") {
        await createLesson(payload);
        showToast("Lesson created.", "success");
      } else if (editing) {
        await updateLesson(editing.id, {
          title: form.title,
          introduction: form.introduction,
          core_concept: form.coreConcept,
          detailed_explanation: form.detailedExplanation,
          examples: form.examples,
          formulas: form.formulas,
          notes: form.notes,
          estimated_reading_minutes: form.estimatedReadingMinutes,
          display_order: form.displayOrder,
          status: form.status,
        });
        showToast("Lesson updated.", "success");
      }
      setEditing(null);
      await refresh(topicId);
    } catch {
      showToast("Couldn't save lesson.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<Lesson>[] = [
    { key: "order", header: "#", render: (r) => r.display_order },
    { key: "title", header: "Title", render: (r) => r.title, searchValue: (r) => r.title },
    { key: "minutes", header: "Read time", render: (r) => (r.estimated_reading_minutes ? `${r.estimated_reading_minutes} min` : "—") },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Lessons</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "180px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Course" placeholder="Select" value={courseId} onChange={(e) => setCourseId(e.target.value)} options={courses.map((c) => ({ value: c.id, label: c.course_code }))} disabled={!departmentId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Topic" placeholder="Select" value={topicId} onChange={(e) => setTopicId(e.target.value)} options={topics.map((t) => ({ value: t.id, label: t.title }))} disabled={!courseId} />
        </div>
      </div>

      {topicId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New lesson
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={lessons}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search lessons..."
            emptyTitle="No lessons yet."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.title}`}>
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New lesson" : "Edit lesson"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Introduction" rows={2} value={form.introduction} onChange={(e) => setForm((f) => ({ ...f, introduction: e.target.value }))} />
          <Textarea label="Core concept" rows={2} value={form.coreConcept} onChange={(e) => setForm((f) => ({ ...f, coreConcept: e.target.value }))} />
          <Textarea label="Detailed explanation" rows={5} value={form.detailedExplanation} onChange={(e) => setForm((f) => ({ ...f, detailedExplanation: e.target.value }))} />
          <Textarea label="Examples" rows={3} value={form.examples} onChange={(e) => setForm((f) => ({ ...f, examples: e.target.value }))} />
          <Textarea label="Formulas" rows={2} value={form.formulas} onChange={(e) => setForm((f) => ({ ...f, formulas: e.target.value }))} />
          <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          <Input
            label="Estimated reading time (minutes)"
            type="number"
            min={1}
            value={form.estimatedReadingMinutes}
            onChange={(e) => setForm((f) => ({ ...f, estimatedReadingMinutes: Number(e.target.value) }))}
          />
          <Input label="Display order" type="number" min={0} value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))} />
          {editing !== "new" && (
            <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ContentStatus }))} options={CONTENT_STATUS_OPTIONS} />
          )}
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
