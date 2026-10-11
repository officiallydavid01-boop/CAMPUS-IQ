import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listFaculties,
  listDepartments,
  listProgrammes,
  listLevels,
  listAcademicSessions,
  listSemesters,
} from "@/services/academic/academicService";
import {
  adminListCourseOfferings,
  adminListCourses,
  createCourseOffering,
  updateCourseOfferingStatus,
} from "@/services/courses/adminCoursesService";
import type {
  AcademicSession,
  ContentStatus,
  Course,
  CourseOfferingWithCourse,
  Department,
  Faculty,
  Institution,
  Level,
  Programme,
  Semester,
} from "@/types/database.types";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/**
 * THE page that implements the "IMPORTANT CLARIFICATION: LEVEL +
 * SEMESTER-SPECIFIC COURSE ASSIGNMENT" requirement end to end: filter the
 * table by any combination of Institution/Faculty/Department/Programme/
 * Level/Session/Semester/Status, and create a Course Offering that pins a
 * Course to one exact Programme + Level + Semester (+ Session +
 * Institution) combination — the same combination
 * `getCourseOfferingsForContext` (student side) and
 * `validate_course_offering_context()` (database trigger) key off.
 */
export function AdminCourseOfferingsPage() {
  const { showToast } = useToast();

  // Filter/selection chain — shared by both the table filters and the
  // "new offering" form, since they need the exact same cascade.
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeId, setProgrammeId] = useState("");
  const [levels, setLevels] = useState<Level[]>([]);
  const [levelId, setLevelId] = useState("");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [semesterId, setSemesterId] = useState("");
  const [statusFilter, setStatusFilter] = useState<ContentStatus | "">("");

  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [capacity, setCapacity] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setFacultyId("");
    setFaculties([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
    setSessionId("");
    setSessions([]);
    if (institutionId) listAcademicSessions(institutionId).then(setSessions).catch(() => showToast("Couldn't load sessions.", "error"));
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId("");
    setDepartments([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);
  useEffect(() => {
    setProgrammeId("");
    setProgrammes([]);
    if (departmentId) listProgrammes(departmentId).then(setProgrammes).catch(() => showToast("Couldn't load programmes.", "error"));
  }, [departmentId, showToast]);
  useEffect(() => {
    setLevelId("");
    setLevels([]);
    if (programmeId) listLevels(programmeId).then(setLevels).catch(() => showToast("Couldn't load levels.", "error"));
  }, [programmeId, showToast]);
  useEffect(() => {
    setSemesterId("");
    setSemesters([]);
    if (sessionId) listSemesters(sessionId).then(setSemesters).catch(() => showToast("Couldn't load semesters.", "error"));
  }, [sessionId, showToast]);

  async function refresh() {
    setIsLoading(true);
    try {
      const rows = await adminListCourseOfferings({
        institutionId: institutionId || undefined,
        programmeId: programmeId || undefined,
        levelId: levelId || undefined,
        semesterId: semesterId || undefined,
        status: statusFilter || undefined,
      });
      setOfferings(rows);
    } catch {
      showToast("Couldn't load course offerings.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [institutionId, programmeId, levelId, semesterId, statusFilter]);

  useEffect(() => {
    if (departmentId) adminListCourses(departmentId).then(setCourses).catch(() => showToast("Couldn't load courses.", "error"));
    else setCourses([]);
  }, [departmentId, showToast]);

  const canCreate = Boolean(institutionId && programmeId && levelId && semesterId && selectedCourseId);

  async function handleCreate() {
    if (!canCreate) return;
    setIsSaving(true);
    try {
      await createCourseOffering({
        courseId: selectedCourseId,
        institutionId,
        programmeId,
        levelId,
        semesterId,
        capacity: capacity ? Number(capacity) : undefined,
      });
      showToast("Course offering created.", "success");
      setIsModalOpen(false);
      setSelectedCourseId("");
      setCapacity("");
      await refresh();
    } catch {
      showToast("Couldn't create that offering — it may already exist for this combination.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: ContentStatus) {
    try {
      await updateCourseOfferingStatus(id, status);
      showToast("Status updated.", "success");
      await refresh();
    } catch {
      showToast("Couldn't update status.", "error");
    }
  }

  const columns: DataTableColumn<CourseOfferingWithCourse>[] = [
    { key: "code", header: "Course", render: (r) => `${r.course.course_code} — ${r.course.title}`, searchValue: (r) => `${r.course.course_code} ${r.course.title}` },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions",
      header: "Change status",
      render: (r) => (
        <Select
          label={`Status for ${r.course.course_code}`}
          hideLabel
          value={r.status}
          onChange={(e) => handleStatusChange(r.id, e.target.value as ContentStatus)}
          options={STATUS_OPTIONS}
        />
      ),
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Course offerings</h1>
        <Button size="sm" onClick={() => setIsModalOpen(true)} disabled={!departmentId}>
          <Plus size={16} /> New offering
        </Button>
      </div>

      <p style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
        Filter by any combination below — this is exactly the level + semester specific matching students see on
        their own Courses page.
      </p>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "180px" }}>
          <Select label="Institution" placeholder="All" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Faculty" placeholder="All" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Department" placeholder="All" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Programme" placeholder="All" value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} options={programmes.map((p) => ({ value: p.id, label: p.name }))} disabled={!departmentId} />
        </div>
        <div style={{ minWidth: "160px" }}>
          <Select label="Level" placeholder="All" value={levelId} onChange={(e) => setLevelId(e.target.value)} options={levels.map((l) => ({ value: l.id, label: l.name }))} disabled={!programmeId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Session" placeholder="All" value={sessionId} onChange={(e) => setSessionId(e.target.value)} options={sessions.map((s) => ({ value: s.id, label: s.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "180px" }}>
          <Select label="Semester" placeholder="All" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} options={semesters.map((s) => ({ value: s.id, label: s.name }))} disabled={!sessionId} />
        </div>
        <div style={{ minWidth: "160px" }}>
          <Select
            label="Status"
            placeholder="All"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContentStatus | "")}
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={offerings}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        searchPlaceholder="Search by course code or title..."
        emptyTitle="No course offerings match these filters."
        emptyDescription="Pick a Programme, Level and Semester above, then create one."
        pageSize={15}
      />

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New course offering">
        {!departmentId ? (
          <p style={{ color: "var(--text-secondary)" }}>
            Pick an Institution, Faculty and Department in the filters above first, so we know which courses to
            offer from.
          </p>
        ) : (
          <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <p style={{ fontSize: "var(--text-sm)" }}>
              Creating an offering for: <strong>{programmes.find((p) => p.id === programmeId)?.name ?? "—"}</strong> ·{" "}
              <strong>{levels.find((l) => l.id === levelId)?.name ?? "—"}</strong> ·{" "}
              <strong>{semesters.find((s) => s.id === semesterId)?.name ?? "—"}</strong>
            </p>
            <Select
              label="Course"
              placeholder="Select a course"
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              options={courses.map((c) => ({ value: c.id, label: `${c.course_code} — ${c.title}` }))}
              required
            />
            <Input
              label="Capacity (optional)"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
            {(!programmeId || !levelId || !semesterId) && (
              <p role="alert" style={{ color: "var(--color-warning)", fontSize: "var(--text-sm)" }}>
                Select a Programme, Level and Semester in the filters above before saving.
              </p>
            )}
            <Button type="submit" isLoading={isSaving} disabled={!canCreate}>
              Create offering
            </Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
