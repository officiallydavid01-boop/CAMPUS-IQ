import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
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
import {
  adminListPastQuestions,
  createPastQuestion,
  updatePastQuestion,
  updatePastQuestionStatus,
} from "@/services/questions/adminPastQuestionsService";
import { EXAM_TYPE_OPTIONS } from "@/services/exams/adminExamsService";
import type { ContentStatus, Course, Department, ExamType, Faculty, Institution, PastQuestion } from "@/types/database.types";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];
interface OptionDraft { text: string; is_correct: boolean }
const blankForm = () => ({ sessionLabel: "", semesterLabel: "", examType: "past_question_exam" as ExamType, prompt: "", correctAnswerText: "", explanation: "" });

export function AdminPastQuestionsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [pastQuestions, setPastQuestions] = useState<PastQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PastQuestion | null>(null);
  const [form, setForm] = useState(blankForm());
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error")); }, [showToast]);
  useEffect(() => {
    setFacultyId(""); setFaculties([]); setDepartmentId(""); setDepartments([]); setCourseId(""); setCourses([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId(""); setDepartments([]); setCourseId(""); setCourses([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);
  useEffect(() => {
    setCourseId(""); setCourses([]);
    if (departmentId) adminListCourses(departmentId).then(setCourses).catch(() => showToast("Couldn't load courses.", "error"));
  }, [departmentId, showToast]);

  async function refresh() {
    if (!courseId) { setPastQuestions([]); return; }
    setIsLoading(true);
    try { setPastQuestions(await adminListPastQuestions(courseId)); }
    catch { showToast("Couldn't load past questions.", "error"); }
    finally { setIsLoading(false); }
  }
  useEffect(() => { void refresh(); /* refresh depends on the selected course only */ }, [courseId]);

  function openCreate() {
    setEditing(null); setForm(blankForm()); setOptions([]); setIsEditorOpen(true);
  }
  function openEdit(row: PastQuestion) {
    setEditing(row);
    setForm({ sessionLabel: row.session_label, semesterLabel: row.semester_label ?? "", examType: row.exam_type, prompt: row.prompt, correctAnswerText: row.correct_answer_text ?? "", explanation: row.explanation ?? "" });
    setOptions((row.options ?? []).map((o) => ({ text: o.text, is_correct: o.is_correct })));
    setIsEditorOpen(true);
  }
  function setOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o, i) => i === index ? { ...o, ...patch } : o));
  }
  function setCorrectOption(index: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, is_correct: i === index })));
  }
  function removeOption(index: number) { setOptions((prev) => prev.filter((_, i) => i !== index)); }

  async function handleSave() {
    if (!courseId || !institutionId) return;
    const cleanedOptions = options.map((o) => ({ text: o.text.trim(), is_correct: o.is_correct })).filter((o) => o.text);
    if (cleanedOptions.length === 1 || (cleanedOptions.length > 0 && (cleanedOptions.length < 2 || cleanedOptions.filter((o) => o.is_correct).length !== 1))) {
      showToast("For multiple-choice options, add at least two options and mark exactly one correct.", "error"); return;
    }
    setIsSaving(true);
    const input = { institutionId, sessionLabel: form.sessionLabel.trim(), semesterLabel: form.semesterLabel.trim() || undefined, examType: form.examType, prompt: form.prompt.trim(), options: cleanedOptions.length ? cleanedOptions : undefined, correctAnswerText: form.correctAnswerText.trim() || undefined, explanation: form.explanation.trim() || undefined };
    try {
      if (editing) await updatePastQuestion(editing.id, input);
      else await createPastQuestion({ courseId, ...input });
      showToast(editing ? "Past question updated." : "Past question created.", "success");
      setIsEditorOpen(false); await refresh();
    } catch { showToast("Couldn't save past question. Check the required fields and try again.", "error"); }
    finally { setIsSaving(false); }
  }
  async function handleStatusChange(id: string, status: ContentStatus) {
    try { await updatePastQuestionStatus(id, status); await refresh(); }
    catch { showToast("Couldn't update status.", "error"); }
  }

  const columns: DataTableColumn<PastQuestion>[] = [
    { key: "session", header: "Session", render: (r) => `${r.session_label}${r.semester_label ? ` — ${r.semester_label}` : ""}` },
    { key: "prompt", header: "Prompt", render: (r) => <span className="truncate" style={{ display: "block", maxWidth: "340px" }}>{r.prompt}</span>, searchValue: (r) => r.prompt },
    { key: "options", header: "Options", render: (r) => r.options?.length ?? 0 },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "edit", header: "Edit", render: (r) => <Button size="sm" variant="secondary" onClick={() => openEdit(r)} aria-label={`Edit past question from ${r.session_label}`}><Pencil size={15} /> Edit</Button> },
    { key: "status_change", header: "Change status", render: (r) => <Select label={`Status for ${r.session_label}`} hideLabel value={r.status} onChange={(e) => handleStatusChange(r.id, e.target.value as ContentStatus)} options={STATUS_OPTIONS} /> },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Past questions</h1>
      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "180px" }}><Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} /></div>
        <div style={{ minWidth: "180px" }}><Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} /></div>
        <div style={{ minWidth: "180px" }}><Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} /></div>
        <div style={{ minWidth: "200px" }}><Select label="Course" placeholder="Select" value={courseId} onChange={(e) => setCourseId(e.target.value)} options={courses.map((c) => ({ value: c.id, label: `${c.course_code} — ${c.title}` }))} disabled={!departmentId} /></div>
      </div>
      {courseId && <>
        <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}><Button size="sm" onClick={openCreate}><Plus size={16} /> New past question</Button></div>
        <DataTable columns={columns} rows={pastQuestions} rowKey={(r) => r.id} isLoading={isLoading} searchPlaceholder="Search past questions..." emptyTitle="No past questions yet." />
      </>}
      <Modal isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} title={editing ? "Edit past question" : "New past question"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
          <Input label="Session (e.g. 2023/2024)" required value={form.sessionLabel} onChange={(e) => setForm((f) => ({ ...f, sessionLabel: e.target.value }))} />
          <Input label="Semester (optional)" value={form.semesterLabel} onChange={(e) => setForm((f) => ({ ...f, semesterLabel: e.target.value }))} />
          <Select label="Exam type" value={form.examType} onChange={(e) => setForm((f) => ({ ...f, examType: e.target.value as ExamType }))} options={EXAM_TYPE_OPTIONS} />
          <Textarea label="Question text" required rows={4} value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} />
          <div className="stack" style={{ gap: "var(--space-2)" }}>
            <div className="cluster" style={{ justifyContent: "space-between" }}><strong>Multiple-choice options (optional)</strong><Button type="button" size="sm" variant="secondary" onClick={() => setOptions((prev) => [...prev, { text: "", is_correct: false }])}><Plus size={14} /> Add option</Button></div>
            {options.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>Leave empty for a written-answer question. Otherwise add at least two options and select the correct one.</p>}
            {options.map((option, index) => <div key={index} className="cluster" style={{ alignItems: "center", gap: "var(--space-2)" }}>
              <Input label={`Option ${index + 1}`} value={option.text} onChange={(e) => setOption(index, { text: e.target.value })} required={options.length > 0} />
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}><input type="radio" name="past-question-correct-option" checked={option.is_correct} onChange={() => setCorrectOption(index)} /> Correct</label>
              <Button type="button" size="sm" variant="ghost" onClick={() => removeOption(index)} aria-label={`Remove option ${index + 1}`}><Trash2 size={16} /></Button>
            </div>)}
          </div>
          <Input label="Correct written answer (optional)" value={form.correctAnswerText} onChange={(e) => setForm((f) => ({ ...f, correctAnswerText: e.target.value }))} />
          <Textarea label="Explanation" rows={3} value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} />
          <Button type="submit" isLoading={isSaving}>{editing ? "Save changes" : "Create past question"}</Button>
        </form>
      </Modal>
    </div>
  );
}
