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
import { adminListTopics, createTopic, updateTopic, CONTENT_STATUS_OPTIONS } from "@/services/courses/adminContentService";
import type { ContentStatus, Course, CourseTopic, Department, Faculty, Institution } from "@/types/database.types";

/** Institution -> Faculty -> Department -> Course -> manage Topics
 * (Master Spec section 26). Topics attach to the reusable Course, not a
 * specific offering — see the design note in
 * supabase/migrations/004_academic_structure.sql. */
export function AdminTopicsPage() {
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
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<CourseTopic | "new" | null>(null);
  const [form, setForm] = useState({ title: "", description: "", displayOrder: 0, status: "draft" as ContentStatus });
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

  async function refresh(cId: string) {
    setIsLoading(true);
    try {
      setTopics(await adminListTopics(cId));
    } catch {
      showToast("Couldn't load topics.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (courseId) refresh(courseId);
    else setTopics([]);
  }, [courseId]);

  function openCreate() {
    setForm({ title: "", description: "", displayOrder: topics.length, status: "draft" });
    setEditing("new");
  }
  function openEdit(t: CourseTopic) {
    setForm({ title: t.title, description: t.description ?? "", displayOrder: t.display_order, status: t.status });
    setEditing(t);
  }

  async function handleSave() {
    if (!courseId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createTopic({ courseId, title: form.title, description: form.description, displayOrder: form.displayOrder });
        showToast("Topic created.", "success");
      } else if (editing) {
        await updateTopic(editing.id, {
          title: form.title,
          description: form.description,
          display_order: form.displayOrder,
          status: form.status,
        });
        showToast("Topic updated.", "success");
      }
      setEditing(null);
      await refresh(courseId);
    } catch {
      showToast("Couldn't save topic.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<CourseTopic>[] = [
    { key: "order", header: "#", render: (r) => r.display_order },
    { key: "title", header: "Title", render: (r) => r.title, searchValue: (r) => r.title },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Topics</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "200px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
        <div style={{ minWidth: "220px" }}>
          <Select label="Course" placeholder="Select" value={courseId} onChange={(e) => setCourseId(e.target.value)} options={courses.map((c) => ({ value: c.id, label: `${c.course_code} — ${c.title}` }))} disabled={!departmentId} />
        </div>
      </div>

      {courseId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New topic
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={topics}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search topics..."
            emptyTitle="No topics yet."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.title}`}>
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New topic" : "Edit topic"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
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
