import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { listInstitutions, listFaculties, listDepartments } from "@/services/academic/academicService";
import { adminListCourses, createCourse, updateCourse } from "@/services/courses/adminCoursesService";
import type { ContentStatus, Course, Department, Faculty, Institution } from "@/types/database.types";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/**
 * Course *identity* management (Master Spec section 24) — not to be
 * confused with Course Offerings (AdminCourseOfferingsPage), which is
 * where a course actually gets assigned to an institution/programme/
 * level/semester. The department filter here is optional: courses can be
 * browsed unfiltered, or narrowed down the same Institution -> Faculty ->
 * Department chain used everywhere else in the Admin CMS.
 */
export function AdminCoursesPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Course | "new" | null>(null);
  const [form, setForm] = useState({ courseCode: "", title: "", description: "", creditUnits: 3, courseType: "core", status: "draft" as ContentStatus });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setFacultyId("");
    setFaculties([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId("");
    setDepartments([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);

  async function refresh() {
    setIsLoading(true);
    try {
      setCourses(await adminListCourses(departmentId || undefined));
    } catch {
      showToast("Couldn't load courses.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [departmentId]);

  function openCreate() {
    setForm({ courseCode: "", title: "", description: "", creditUnits: 3, courseType: "core", status: "draft" });
    setEditing("new");
  }
  function openEdit(c: Course) {
    setForm({
      courseCode: c.course_code,
      title: c.title,
      description: c.description ?? "",
      creditUnits: c.credit_units,
      courseType: c.course_type ?? "core",
      status: c.status,
    });
    setEditing(c);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createCourse({
          courseCode: form.courseCode,
          title: form.title,
          description: form.description,
          creditUnits: form.creditUnits,
          courseType: form.courseType,
          departmentId: departmentId || undefined,
        });
        showToast("Course created.", "success");
      } else if (editing) {
        await updateCourse(editing.id, {
          title: form.title,
          description: form.description,
          credit_units: form.creditUnits,
          course_type: form.courseType,
          status: form.status,
        });
        showToast("Course updated.", "success");
      }
      setEditing(null);
      await refresh();
    } catch {
      showToast("Couldn't save course — check the course code is unique.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<Course>[] = [
    { key: "course_code", header: "Code", render: (r) => r.course_code, searchValue: (r) => r.course_code },
    { key: "title", header: "Title", render: (r) => r.title, searchValue: (r) => r.title },
    { key: "credit_units", header: "Units", render: (r) => r.credit_units },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Courses</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} /> New course
        </Button>
      </div>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "200px" }}>
          <Select label="Institution" placeholder="All" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Faculty" placeholder="All" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Department" placeholder="All" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={courses}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        searchPlaceholder="Search by code or title..."
        emptyTitle="No courses yet."
        actions={(r) => (
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.course_code}`}>
            <Pencil size={14} />
          </Button>
        )}
      />

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New course" : `Edit ${form.courseCode}`}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input
            label="Course code"
            placeholder="e.g. CSC101"
            required
            disabled={editing !== "new"}
            value={form.courseCode}
            onChange={(e) => setForm((f) => ({ ...f, courseCode: e.target.value }))}
          />
          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Input label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Input
            label="Credit units"
            type="number"
            min={0}
            max={12}
            required
            value={form.creditUnits}
            onChange={(e) => setForm((f) => ({ ...f, creditUnits: Number(e.target.value) }))}
          />
          <Select
            label="Course type"
            value={form.courseType}
            onChange={(e) => setForm((f) => ({ ...f, courseType: e.target.value }))}
            options={[
              { value: "core", label: "Core" },
              { value: "elective", label: "Elective" },
            ]}
          />
          {editing !== "new" && (
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ContentStatus }))}
              options={STATUS_OPTIONS}
            />
          )}
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
