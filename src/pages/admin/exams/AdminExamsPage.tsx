import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
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
import { adminListCourseOfferings } from "@/services/courses/adminCoursesService";
import {
  adminListExams,
  adminListExamQuestionIds,
  createExam,
  updateExam,
  updateExamStatus,
  listEligibleQuestions,
  EXAM_TYPE_OPTIONS,
} from "@/services/exams/adminExamsService";
import type {
  AcademicSession,
  ContentStatus,
  CourseOfferingWithCourse,
  Department,
  Exam,
  ExamType,
  DifficultyLevel,
  Faculty,
  Institution,
  Level,
  Programme,
  Question,
  Semester,
} from "@/types/database.types";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

/**
 * Exams attach to a specific Course Offering, so this page's selector
 * chain matches AdminCourseOfferingsPage's (Institution -> ... ->
 * Semester -> Offering) rather than the Course-based chain the other
 * content pages use — see the design note in adminExamsService.ts.
 */
export function AdminExamsPage() {
  const { showToast } = useToast();
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
  const [offerings, setOfferings] = useState<CourseOfferingWithCourse[]>([]);
  const [offeringId, setOfferingId] = useState("");

  const [exams, setExams] = useState<Exam[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibleQuestions, setEligibleQuestions] = useState<Question[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    examType: "mock_exam" as ExamType,
    durationMinutes: 30,
    difficulty: "medium" as DifficultyLevel,
    attemptLimit: "3",
    availableFrom: "",
    availableUntil: "",
  });
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setFacultyId(""); setFaculties([]); setSessionId(""); setSessions([]);
    if (institutionId) {
      listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
      listAcademicSessions(institutionId).then(setSessions).catch(() => showToast("Couldn't load sessions.", "error"));
    }
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId(""); setDepartments([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);
  useEffect(() => {
    setProgrammeId(""); setProgrammes([]);
    if (departmentId) listProgrammes(departmentId).then(setProgrammes).catch(() => showToast("Couldn't load programmes.", "error"));
  }, [departmentId, showToast]);
  useEffect(() => {
    setLevelId(""); setLevels([]);
    if (programmeId) listLevels(programmeId).then(setLevels).catch(() => showToast("Couldn't load levels.", "error"));
  }, [programmeId, showToast]);
  useEffect(() => {
    setSemesterId(""); setSemesters([]);
    if (sessionId) listSemesters(sessionId).then(setSemesters).catch(() => showToast("Couldn't load semesters.", "error"));
  }, [sessionId, showToast]);
  useEffect(() => {
    setOfferingId(""); setOfferings([]);
    if (institutionId && programmeId && levelId && semesterId) {
      adminListCourseOfferings({ institutionId, programmeId, levelId, semesterId })
        .then(setOfferings)
        .catch(() => showToast("Couldn't load course offerings.", "error"));
    }
  }, [institutionId, programmeId, levelId, semesterId, showToast]);

  async function refresh(offId: string) {
    setIsLoading(true);
    try {
      setExams(await adminListExams(offId));
    } catch {
      showToast("Couldn't load exams.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (offeringId) refresh(offeringId);
    else setExams([]);
  }, [offeringId]);

  const selectedOffering = offerings.find((o) => o.id === offeringId);

  async function openCreate() {
    setEditingExam(null);
    setForm({ title: "", description: "", examType: "mock_exam", durationMinutes: 30, difficulty: "medium", attemptLimit: "3", availableFrom: "", availableUntil: "" });
    setSelectedQuestionIds(new Set());
    if (selectedOffering) {
      try {
        setEligibleQuestions(await listEligibleQuestions(selectedOffering.course_id));
      } catch {
        showToast("Couldn't load eligible questions.", "error");
      }
    }
    setIsCreateOpen(true);
  }

  function toLocalDateTime(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  async function openEdit(exam: Exam) {
    setEditingExam(exam);
    setForm({
      title: exam.title,
      description: exam.description ?? "",
      examType: exam.exam_type,
      durationMinutes: exam.duration_minutes,
      difficulty: exam.difficulty ?? "medium",
      attemptLimit: exam.attempt_limit == null ? "" : String(exam.attempt_limit),
      availableFrom: toLocalDateTime(exam.available_from),
      availableUntil: toLocalDateTime(exam.available_until),
    });
    try {
      const [questions, questionIds] = await Promise.all([listEligibleQuestions(selectedOffering?.course_id ?? ""), adminListExamQuestionIds(exam.id)]);
      setEligibleQuestions(questions);
      setSelectedQuestionIds(new Set(questionIds));
      setIsCreateOpen(true);
    } catch {
      showToast("Couldn't load the exam editor.", "error");
    }
  }

  function toggleQuestion(id: string) {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveExam() {
    if (!offeringId || selectedQuestionIds.size === 0) {
      showToast("Select at least one question.", "error");
      return;
    }
    if (form.availableFrom && form.availableUntil && new Date(form.availableUntil) <= new Date(form.availableFrom)) {
      showToast("The exam closing time must be after its opening time.", "error");
      return;
    }
    setIsSaving(true);
    try {
      const examInput = {
        courseOfferingId: offeringId,
        title: form.title,
        description: form.description,
        examType: form.examType,
        durationMinutes: form.durationMinutes,
        difficulty: form.difficulty,
        attemptLimit: form.attemptLimit.trim() ? Number(form.attemptLimit) : undefined,
        availableFrom: form.availableFrom ? new Date(form.availableFrom).toISOString() : undefined,
        availableUntil: form.availableUntil ? new Date(form.availableUntil).toISOString() : undefined,
        questionIds: Array.from(selectedQuestionIds),
      };
      if (editingExam) {
        await updateExam(editingExam.id, examInput);
        showToast("Exam updated.", "success");
      } else {
        await createExam(examInput);
        showToast("Exam created.", "success");
      }
      setIsCreateOpen(false);
      await refresh(offeringId);
    } catch {
      showToast(editingExam ? "Couldn't update exam. If attempts already exist, create a new exam version." : "Couldn't create exam.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: ContentStatus) {
    try {
      await updateExamStatus(id, status);
      showToast("Status updated.", "success");
      await refresh(offeringId);
    } catch {
      showToast("Couldn't update status.", "error");
    }
  }

  const columns: DataTableColumn<Exam>[] = [
    { key: "title", header: "Title", render: (r) => r.title, searchValue: (r) => r.title },
    { key: "type", header: "Type", render: (r) => r.exam_type.replace("_", " ") },
    { key: "questions", header: "Questions", render: (r) => r.question_count },
    { key: "duration", header: "Duration", render: (r) => `${r.duration_minutes} min` },
    { key: "attempts", header: "Attempt limit", render: (r) => r.attempt_limit == null ? "Unlimited" : r.attempt_limit },
    { key: "schedule", header: "Availability", render: (r) => r.available_from || r.available_until ? `${r.available_from ? new Date(r.available_from).toLocaleString() : "Now"} → ${r.available_until ? new Date(r.available_until).toLocaleString() : "No end"}` : "Always" },
    { key: "edit", header: "Edit", render: (r) => <Button size="sm" variant="secondary" onClick={() => void openEdit(r)}>Edit</Button> },
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
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Exams</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "160px" }}><Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} /></div>
        <div style={{ minWidth: "160px" }}><Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} /></div>
        <div style={{ minWidth: "160px" }}><Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} /></div>
        <div style={{ minWidth: "160px" }}><Select label="Programme" placeholder="Select" value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} options={programmes.map((p) => ({ value: p.id, label: p.name }))} disabled={!departmentId} /></div>
        <div style={{ minWidth: "140px" }}><Select label="Level" placeholder="Select" value={levelId} onChange={(e) => setLevelId(e.target.value)} options={levels.map((l) => ({ value: l.id, label: l.name }))} disabled={!programmeId} /></div>
        <div style={{ minWidth: "160px" }}><Select label="Session" placeholder="Select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} options={sessions.map((s) => ({ value: s.id, label: s.name }))} disabled={!institutionId} /></div>
        <div style={{ minWidth: "160px" }}><Select label="Semester" placeholder="Select" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} options={semesters.map((s) => ({ value: s.id, label: s.name }))} disabled={!sessionId} /></div>
        <div style={{ minWidth: "220px" }}>
          <Select
            label="Course offering"
            placeholder="Select"
            value={offeringId}
            onChange={(e) => setOfferingId(e.target.value)}
            options={offerings.map((o) => ({ value: o.id, label: `${o.course.course_code} — ${o.course.title}` }))}
            disabled={!programmeId || !levelId || !semesterId}
          />
        </div>
      </div>

      {offeringId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New exam
            </Button>
          </div>
          <DataTable columns={columns} rows={exams} rowKey={(r) => r.id} isLoading={isLoading} searchPlaceholder="Search exams..." emptyTitle="No exams yet." />
        </>
      )}

      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title={editingExam ? "Edit exam" : "New exam"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); void handleSaveExam(); }}>
          <Input label="Title" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <Textarea label="Description" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          <Select label="Exam type" value={form.examType} onChange={(e) => setForm((f) => ({ ...f, examType: e.target.value as ExamType }))} options={EXAM_TYPE_OPTIONS} />
          <Input label="Duration (minutes)" type="number" min={1} required value={form.durationMinutes} onChange={(e) => setForm((f) => ({ ...f, durationMinutes: Number(e.target.value) }))} />
          <Select label="Difficulty" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as DifficultyLevel }))} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
          <Input label="Attempt limit (leave blank for unlimited)" type="number" min={1} value={form.attemptLimit} onChange={(e) => setForm((f) => ({ ...f, attemptLimit: e.target.value }))} />
          <Input label="Available from (optional)" type="datetime-local" value={form.availableFrom} onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))} />
          <Input label="Available until (optional)" type="datetime-local" value={form.availableUntil} onChange={(e) => setForm((f) => ({ ...f, availableUntil: e.target.value }))} />

          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }}>
              Questions ({selectedQuestionIds.size} selected)
            </span>
            {eligibleQuestions.length === 0 ? (
              <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                No published questions exist for this course yet — add some in Question bank first.
              </p>
            ) : (
              <div className="stack scroll-x" style={{ gap: "var(--space-1)", maxHeight: "240px", overflowY: "auto" }}>
                {eligibleQuestions.map((q) => (
                  <label key={q.id} className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                    <input type="checkbox" checked={selectedQuestionIds.has(q.id)} onChange={() => toggleQuestion(q.id)} />
                    <span className="truncate">{q.prompt}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {editingExam && <p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>For score integrity, the database blocks configuration changes after a student has started an attempt. Create a new exam version instead.</p>}
          <Button type="submit" isLoading={isSaving} disabled={selectedQuestionIds.size === 0}>
            {editingExam ? "Save exam changes" : "Create exam"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
