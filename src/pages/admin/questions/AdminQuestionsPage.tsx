import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { listInstitutions, listFaculties, listDepartments } from "@/services/academic/academicService";
import { adminListCourses } from "@/services/courses/adminCoursesService";
import { adminListTopics } from "@/services/courses/adminContentService";
import {
  adminListQuestions,
  adminListQuestionOptions,
  createQuestion,
  updateQuestion,
  replaceQuestionOptions,
  QUESTION_TYPE_OPTIONS,
  DIFFICULTY_OPTIONS,
  QUESTION_STATUS_OPTIONS,
} from "@/services/questions/adminQuestionsService";
import type {
  ContentStatus,
  Course,
  CourseTopic,
  Department,
  DifficultyLevel,
  Faculty,
  Institution,
  Question,
  QuestionType,
} from "@/types/database.types";

interface OptionDraft {
  optionText: string;
  isCorrect: boolean;
}

const NEEDS_OPTIONS: QuestionType[] = ["multiple_choice", "true_false"];
const NEEDS_TEXT_ANSWER: QuestionType[] = ["numerical", "short_answer"];

/**
 * Institution -> Faculty -> Department -> Course -> (Topic) -> manage the
 * question bank (Master Spec section 29). The options editor only
 * appears for multiple_choice/true_false; numerical/short_answer get a
 * single "correct answer" text field instead; structured gets neither
 * (Master Spec: not auto-gradable, reviewed manually — see
 * evaluate_answer() in migration 016).
 */
export function AdminQuestionsPage() {
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
  const [topicFilter, setTopicFilter] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [editing, setEditing] = useState<Question | "new" | null>(null);
  const [form, setForm] = useState({
    topicId: "",
    questionType: "multiple_choice" as QuestionType,
    prompt: "",
    difficulty: "medium" as DifficultyLevel,
    explanation: "",
    source: "",
    xpValue: 5,
    correctAnswerText: "",
    status: "draft" as ContentStatus,
  });
  const [options, setOptions] = useState<OptionDraft[]>([
    { optionText: "", isCorrect: true },
    { optionText: "", isCorrect: false },
  ]);
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
    setTopicFilter(""); setTopics([]);
    if (courseId) adminListTopics(courseId).then(setTopics).catch(() => showToast("Couldn't load topics.", "error"));
  }, [courseId, showToast]);

  async function refresh() {
    if (!courseId) return;
    setIsLoading(true);
    try {
      setQuestions(await adminListQuestions(courseId, topicFilter || undefined));
    } catch {
      showToast("Couldn't load questions.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [courseId, topicFilter]);

  function openCreate() {
    setForm({
      topicId: topicFilter,
      questionType: "multiple_choice",
      prompt: "",
      difficulty: "medium",
      explanation: "",
      source: "",
      xpValue: 5,
      correctAnswerText: "",
      status: "draft",
    });
    setOptions([
      { optionText: "", isCorrect: true },
      { optionText: "", isCorrect: false },
    ]);
    setEditing("new");
  }

  async function openEdit(q: Question) {
    setForm({
      topicId: q.topic_id ?? "",
      questionType: q.question_type,
      prompt: q.prompt,
      difficulty: q.difficulty,
      explanation: q.explanation ?? "",
      source: q.source ?? "",
      xpValue: q.xp_value,
      correctAnswerText: q.correct_answer_text ?? "",
      status: q.status,
    });
    if (NEEDS_OPTIONS.includes(q.question_type)) {
      const existing = await adminListQuestionOptions(q.id);
      setOptions(
        existing.length > 0
          ? existing.map((o) => ({ optionText: o.option_text, isCorrect: o.is_correct }))
          : [{ optionText: "", isCorrect: true }, { optionText: "", isCorrect: false }]
      );
    }
    setEditing(q);
  }

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function addOption() {
    setOptions((prev) => [...prev, { optionText: "", isCorrect: false }]);
  }
  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }
  function setSingleCorrect(index: number) {
    setOptions((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === index })));
  }

  async function handleSave() {
    if (!courseId) return;
    setIsSaving(true);
    try {
      let questionId: string;
      if (editing === "new") {
        const created = await createQuestion({
          courseId,
          topicId: form.topicId || undefined,
          questionType: form.questionType,
          prompt: form.prompt,
          difficulty: form.difficulty,
          explanation: form.explanation,
          source: form.source,
          xpValue: form.xpValue,
          correctAnswerText: NEEDS_TEXT_ANSWER.includes(form.questionType) ? form.correctAnswerText : undefined,
        });
        questionId = created.id;
        showToast("Question created.", "success");
      } else if (editing) {
        await updateQuestion(editing.id, {
          topic_id: form.topicId || null,
          prompt: form.prompt,
          difficulty: form.difficulty,
          explanation: form.explanation,
          source: form.source,
          xp_value: form.xpValue,
          correct_answer_text: NEEDS_TEXT_ANSWER.includes(form.questionType) ? form.correctAnswerText : null,
          status: form.status,
        });
        questionId = editing.id;
        showToast("Question updated.", "success");
      } else {
        return;
      }

      if (NEEDS_OPTIONS.includes(form.questionType)) {
        const validOptions = options.filter((o) => o.optionText.trim());
        if (validOptions.length < 2 || !validOptions.some((o) => o.isCorrect)) {
          showToast("Add at least 2 options and mark one correct.", "error");
          setIsSaving(false);
          return;
        }
        await replaceQuestionOptions(questionId, validOptions);
      }

      setEditing(null);
      await refresh();
    } catch {
      showToast("Couldn't save question.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<Question>[] = [
    { key: "prompt", header: "Prompt", render: (r) => <span className="truncate" style={{ display: "block", maxWidth: "360px" }}>{r.prompt}</span>, searchValue: (r) => r.prompt },
    { key: "type", header: "Type", render: (r) => <Badge tone="neutral">{r.question_type.replace("_", " ")}</Badge> },
    { key: "difficulty", header: "Difficulty", render: (r) => r.difficulty },
    { key: "xp", header: "XP", render: (r) => r.xp_value },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Question bank</h1>

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
          <Select label="Topic" placeholder="All topics" value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} options={topics.map((t) => ({ value: t.id, label: t.title }))} disabled={!courseId} />
        </div>
      </div>

      {courseId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New question
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={questions}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search question prompts..."
            emptyTitle="No questions yet."
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label="Edit question">
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New question" : "Edit question"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Select
            label="Topic (optional)"
            placeholder="No specific topic"
            value={form.topicId}
            onChange={(e) => setForm((f) => ({ ...f, topicId: e.target.value }))}
            options={topics.map((t) => ({ value: t.id, label: t.title }))}
          />
          {editing === "new" && (
            <Select
              label="Question type"
              value={form.questionType}
              onChange={(e) => setForm((f) => ({ ...f, questionType: e.target.value as QuestionType }))}
              options={QUESTION_TYPE_OPTIONS}
            />
          )}
          <Textarea label="Prompt" required rows={3} value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} />

          {NEEDS_OPTIONS.includes(form.questionType) && (
            <div className="stack" style={{ gap: "var(--space-2)" }}>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-weight-medium)" }}>Options (select the correct one)</span>
              {options.map((opt, i) => (
                <div key={i} className="cluster" style={{ gap: "var(--space-2)" }}>
                  <input type="radio" name="correct-option" checked={opt.isCorrect} onChange={() => setSingleCorrect(i)} aria-label={`Mark option ${i + 1} correct`} />
                  <input
                    value={opt.optionText}
                    onChange={(e) => updateOption(i, { optionText: e.target.value })}
                    placeholder={`Option ${i + 1}`}
                    style={{ flex: 1, background: "var(--bg-surface-secondary)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", color: "var(--text-primary)" }}
                  />
                  {options.length > 2 && (
                    <button type="button" onClick={() => removeOption(i)} aria-label="Remove option" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addOption} style={{ alignSelf: "flex-start" }}>
                <Plus size={14} /> Add option
              </Button>
            </div>
          )}

          {NEEDS_TEXT_ANSWER.includes(form.questionType) && (
            <Input
              label="Correct answer"
              required
              hint="Graded case-insensitively, trimmed of whitespace."
              value={form.correctAnswerText}
              onChange={(e) => setForm((f) => ({ ...f, correctAnswerText: e.target.value }))}
            />
          )}

          {form.questionType === "structured" && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              Structured questions aren't auto-graded — there's no manual-review queue yet, so use sparingly for now.
            </p>
          )}

          <Textarea label="Explanation (shown after answering)" rows={2} value={form.explanation} onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))} />
          <Input label="Source (optional)" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
          <Select label="Difficulty" value={form.difficulty} onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value as DifficultyLevel }))} options={DIFFICULTY_OPTIONS} />
          <Input label="XP value" type="number" min={0} value={form.xpValue} onChange={(e) => setForm((f) => ({ ...f, xpValue: Number(e.target.value) }))} />
          {editing !== "new" && (
            <Select label="Status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ContentStatus }))} options={QUESTION_STATUS_OPTIONS} />
          )}
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
