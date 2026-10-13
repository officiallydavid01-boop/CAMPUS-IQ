
import { useEffect, useState, useRef } from "react";
import { clearDraft, loadDraft, saveDraft } from "@/utils/draftstorage";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge, Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listFaculties,
  listDepartments,
} from "@/services/academic/academicService";
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

interface QuestionFormDraft {
  topicId: string;
  questionType: QuestionType;
  prompt: string;
  difficulty: DifficultyLevel;
  explanation: string;
  source: string;
  xpValue: number;
  correctAnswerText: string;
  status: ContentStatus;
}

interface QuestionPageDraft {
  institutionId: string;
  facultyId: string;
  departmentId: string;
  courseId: string;
  topicFilter: string;
  editingId: string | "new" | null;
  editingQuestion: Question | null;
  form: QuestionFormDraft;
  options: OptionDraft[];
}

const DRAFT_KEY = "admin:question-bank";

const NEEDS_OPTIONS: QuestionType[] = [
  "multiple_choice",
  "true_false",
];

const NEEDS_TEXT_ANSWER: QuestionType[] = [
  "numerical",
  "short_answer",
];

const DEFAULT_FORM: QuestionFormDraft = {
  topicId: "",
  questionType: "multiple_choice",
  prompt: "",
  difficulty: "medium",
  explanation: "",
  source: "",
  xpValue: 5,
  correctAnswerText: "",
  status: "draft",
};

const DEFAULT_OPTIONS: OptionDraft[] = [
  { optionText: "", isCorrect: true },
  { optionText: "", isCorrect: false },
];

/**
 * Institution -> Faculty -> Department -> Course -> Topic -> Question bank.
 *
 * Draft recovery preserves the user's selections and unfinished question
 * when the browser or app reloads unexpectedly.
 */
export function AdminQuestionsPage() {
  const { showToast } = useToast();

  const isRestoringDraft = useRef(false);
  const hasRestoredDraft = useRef(false);

  const [draftRestoreReady, setDraftRestoreReady] = useState(false);

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

  const [form, setForm] = useState<QuestionFormDraft>({
    ...DEFAULT_FORM,
  });

  const [options, setOptions] = useState<OptionDraft[]>(
    DEFAULT_OPTIONS.map((option) => ({ ...option })),
  );

  const [isSaving, setIsSaving] = useState(false);

  /*
   * Restore the saved draft once when the page opens.
   *
   * The academic lists are loaded in order so that the restored selections
   * have their corresponding dropdown options available.
   */
  useEffect(() => {
    let cancelled = false;

    async function restoreDraft() {
      isRestoringDraft.current = true;

      try {
        const institutionsData = await listInstitutions();

        if (cancelled) return;

        setInstitutions(institutionsData);

        const saved = loadDraft<QuestionPageDraft>(DRAFT_KEY);
        const draft = saved?.data;

        if (!draft) {
          hasRestoredDraft.current = true;
          return;
        }

        const validInstitution = institutionsData.some(
          (item) => item.id === draft.institutionId,
        );

        if (!validInstitution) {
          clearDraft(DRAFT_KEY);
          hasRestoredDraft.current = true;
          return;
        }

        setInstitutionId(draft.institutionId);

        const facultiesData = await listFaculties(draft.institutionId);

        if (cancelled) return;

        setFaculties(facultiesData);

        const validFaculty = facultiesData.some(
          (item) => item.id === draft.facultyId,
        );

        if (!validFaculty) {
          setFacultyId("");
          hasRestoredDraft.current = true;
          return;
        }

        setFacultyId(draft.facultyId);

        const departmentsData = await listDepartments(draft.facultyId);

        if (cancelled) return;

        setDepartments(departmentsData);

        const validDepartment = departmentsData.some(
          (item) => item.id === draft.departmentId,
        );

        if (!validDepartment) {
          setDepartmentId("");
          hasRestoredDraft.current = true;
          return;
        }

        setDepartmentId(draft.departmentId);

        const coursesData = await adminListCourses(draft.departmentId);

        if (cancelled) return;

        setCourses(coursesData);

        const validCourse = coursesData.some(
          (item) => item.id === draft.courseId,
        );

        if (!validCourse) {
          setCourseId("");
          hasRestoredDraft.current = true;
          return;
        }

        setCourseId(draft.courseId);

        const topicsData = await adminListTopics(draft.courseId);

        if (cancelled) return;

        setTopics(topicsData);

        const validTopic =
          !draft.topicFilter ||
          topicsData.some((item) => item.id === draft.topicFilter);

        setTopicFilter(validTopic ? draft.topicFilter : "");

        const restoredForm: QuestionFormDraft = {
          ...DEFAULT_FORM,
          ...draft.form,
        };

        if (
          restoredForm.topicId &&
          !topicsData.some((item) => item.id === restoredForm.topicId)
        ) {
          restoredForm.topicId = "";
        }

        setForm(restoredForm);

        setOptions(
          Array.isArray(draft.options) && draft.options.length > 0
            ? draft.options.map((option) => ({
                optionText: option.optionText,
                isCorrect: Boolean(option.isCorrect),
              }))
            : DEFAULT_OPTIONS.map((option) => ({ ...option })),
        );

        if (draft.editingId === "new") {
          setEditing("new");
        } else if (
          draft.editingId &&
          draft.editingQuestion &&
          draft.editingQuestion.id === draft.editingId
        ) {
          setEditing(draft.editingQuestion);
        } else {
          setEditing(null);
        }

        hasRestoredDraft.current = true;

        showToast(
          "Your unfinished question draft has been restored.",
          "success",
        );
      } catch {
        /*
         * Do not enable autosaving when restoration failed.
         * This protects an existing saved draft from being overwritten
         * by incomplete default state.
         */
        showToast(
          "Couldn't restore your saved draft. Your saved data was left untouched.",
          "error",
        );
      } finally {
        if (!cancelled) {
          setDraftRestoreReady(true);
        }
      }
    }

    restoreDraft();

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  /*
   * Keep the draft synchronized with changes, but only while a question
   * editor is open. Closing the editor or saving successfully clears it.
   */
  useEffect(() => {
    if (!draftRestoreReady || !hasRestoredDraft.current) return;
    if (isRestoringDraft.current) return;

    if (editing === null) {
      clearDraft(DRAFT_KEY);
      return;
    }

    const draft: QuestionPageDraft = {
      institutionId,
      facultyId,
      departmentId,
      courseId,
      topicFilter,
      editingId: editing === "new" ? "new" : editing.id,
      editingQuestion: editing === "new" ? null : editing,
      form,
      options,
    };

    saveDraft(DRAFT_KEY, draft);
  }, [
    draftRestoreReady,
    institutionId,
    facultyId,
    departmentId,
    courseId,
    topicFilter,
    editing,
    form,
    options,
  ]);

  useEffect(() => {
    if (!draftRestoreReady) return;

    isRestoringDraft.current = false;
  }, [draftRestoreReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadFaculties() {
      setFaculties([]);
      setDepartments([]);
      setCourses([]);
      setTopics([]);

      if (!isRestoringDraft.current) {
        setFacultyId("");
        setDepartmentId("");
        setCourseId("");
        setTopicFilter("");
      }

      if (!institutionId) return;

      try {
        const data = await listFaculties(institutionId);

        if (!cancelled) setFaculties(data);
      } catch {
        if (!cancelled) {
          showToast("Couldn't load faculties.", "error");
        }
      }
    }

    loadFaculties();

    return () => {
      cancelled = true;
    };
  }, [institutionId, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadDepartments() {
      setDepartments([]);
      setCourses([]);
      setTopics([]);

      if (!isRestoringDraft.current) {
        setDepartmentId("");
        setCourseId("");
        setTopicFilter("");
      }

      if (!facultyId) return;

      try {
        const data = await listDepartments(facultyId);

        if (!cancelled) setDepartments(data);
      } catch {
        if (!cancelled) {
          showToast("Couldn't load departments.", "error");
        }
      }
    }

    loadDepartments();

    return () => {
      cancelled = true;
    };
  }, [facultyId, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourses() {
      setCourses([]);
      setTopics([]);

      if (!isRestoringDraft.current) {
        setCourseId("");
        setTopicFilter("");
      }

      if (!departmentId) return;

      try {
        const data = await adminListCourses(departmentId);

        if (!cancelled) setCourses(data);
      } catch {
        if (!cancelled) {
          showToast("Couldn't load courses.", "error");
        }
      }
    }

    loadCourses();

    return () => {
      cancelled = true;
    };
  }, [departmentId, showToast]);

  useEffect(() => {
    let cancelled = false;

    async function loadTopics() {
      setTopics([]);

      if (!isRestoringDraft.current) {
        setTopicFilter("");
      }

      if (!courseId) return;

      try {
        const data = await adminListTopics(courseId);

        if (!cancelled) setTopics(data);
      } catch {
        if (!cancelled) {
          showToast("Couldn't load topics.", "error");
        }
      }
    }

    loadTopics();

    return () => {
      cancelled = true;
    };
  }, [courseId, showToast]);

  async function refresh() {
    if (!courseId) {
      setQuestions([]);
      return;
    }

    setIsLoading(true);

    try {
      setQuestions(
        await adminListQuestions(courseId, topicFilter || undefined),
      );
    } catch {
      showToast("Couldn't load questions.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isRestoringDraft.current) return;

    refresh();
  }, [courseId, topicFilter]);

  function openCreate() {
    setForm({
      ...DEFAULT_FORM,
      topicId: topicFilter,
    });

    setOptions(DEFAULT_OPTIONS.map((option) => ({ ...option })));
    setEditing("new");
  }

  async function openEdit(q: Question) {
    try {
      const existing = NEEDS_OPTIONS.includes(q.question_type)
        ? await adminListQuestionOptions(q.id)
        : [];

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

      setOptions(
        existing.length > 0
          ? existing.map((option) => ({
              optionText: option.option_text,
              isCorrect: option.is_correct,
            }))
          : DEFAULT_OPTIONS.map((option) => ({ ...option })),
      );

      setEditing(q);
    } catch {
      showToast("Couldn't load the question's options.", "error");
    }
  }

  function updateOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((previous) =>
      previous.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    );
  }

  function addOption() {
    setOptions((previous) => [
      ...previous,
      { optionText: "", isCorrect: false },
    ]);
  }

  function removeOption(index: number) {
    setOptions((previous) =>
      previous.filter((_, i) => i !== index),
    );
  }

  function setSingleCorrect(index: number) {
    setOptions((previous) =>
      previous.map((option, i) => ({
        ...option,
        isCorrect: i === index,
      })),
    );
  }

  function closeEditor() {
    setEditing(null);
    clearDraft(DRAFT_KEY);
  }

  async function handleSave() {
    if (!courseId || !editing) return;

    const validOptions = options.filter(
      (option) => option.optionText.trim(),
    );

    if (NEEDS_OPTIONS.includes(form.questionType)) {
      if (
        validOptions.length < 2 ||
        !validOptions.some((option) => option.isCorrect)
      ) {
        showToast(
          "Add at least 2 options and mark one correct.",
          "error",
        );
        return;
      }
    }

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
          correctAnswerText: NEEDS_TEXT_ANSWER.includes(
            form.questionType,
          )
            ? form.correctAnswerText
            : undefined,
        });

        questionId = created.id;

        if (NEEDS_OPTIONS.includes(form.questionType)) {
          await replaceQuestionOptions(questionId, validOptions);
        }

        showToast("Question created.", "success");
      } else {
        await updateQuestion(editing.id, {
          topic_id: form.topicId || null,
          prompt: form.prompt,
          difficulty: form.difficulty,
          explanation: form.explanation,
          source: form.source,
          xp_value: form.xpValue,
          correct_answer_text: NEEDS_TEXT_ANSWER.includes(
            form.questionType,
          )
            ? form.correctAnswerText
            : null,
          status: form.status,
        });

        questionId = editing.id;

        if (NEEDS_OPTIONS.includes(form.questionType)) {
          await replaceQuestionOptions(questionId, validOptions);
        }

        showToast("Question updated.", "success");
      }

      clearDraft(DRAFT_KEY);
      setEditing(null);
      setForm({ ...DEFAULT_FORM });
      setOptions(DEFAULT_OPTIONS.map((option) => ({ ...option })));

      await refresh();
    } catch {
      showToast(
        "Couldn't save the question. Your draft has been kept.",
        "error",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<Question>[] = [
    {
      key: "prompt",
      header: "Prompt",
      render: (row) => (
        <span
          className="truncate"
          style={{ display: "block", maxWidth: "360px" }}
        >
          {row.prompt}
        </span>
      ),
      searchValue: (row) => row.prompt,
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <Badge tone="neutral">
          {row.question_type.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "difficulty",
      header: "Difficulty",
      render: (row) => row.difficulty,
    },
    {
      key: "xp",
      header: "XP",
      render: (row) => row.xp_value,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div
      className="container"
      style={{ paddingBlock: "var(--space-8)" }}
    >
      <h1
        style={{
          fontSize: "var(--text-2xl)",
          marginBottom: "var(--space-6)",
        }}
      >
        Question bank
      </h1>

      <div
        className="cluster"
        style={{
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: "180px" }}>
          <Select
            label="Institution"
            placeholder="Select"
            value={institutionId}
            onChange={(event) => setInstitutionId(event.target.value)}
            options={institutions.map((institution) => ({
              value: institution.id,
              label: institution.name,
            }))}
          />
        </div>

        <div style={{ minWidth: "180px" }}>
          <Select
            label="Faculty"
            placeholder="Select"
            value={facultyId}
            onChange={(event) => setFacultyId(event.target.value)}
            options={faculties.map((faculty) => ({
              value: faculty.id,
              label: faculty.name,
            }))}
            disabled={!institutionId}
          />
        </div>

        <div style={{ minWidth: "180px" }}>
          <Select
            label="Department"
            placeholder="Select"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            disabled={!facultyId}
          />
        </div>

        <div style={{ minWidth: "200px" }}>
          <Select
            label="Course"
            placeholder="Select"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            options={courses.map((course) => ({
              value: course.id,
              label: course.course_code,
            }))}
            disabled={!departmentId}
          />
        </div>

        <div style={{ minWidth: "200px" }}>
          <Select
            label="Topic"
            placeholder="All topics"
            value={topicFilter}
            onChange={(event) => setTopicFilter(event.target.value)}
            options={topics.map((topic) => ({
              value: topic.id,
              label: topic.title,
            }))}
            disabled={!courseId}
          />
        </div>
      </div>

      {courseId && (
        <>
          <div
            className="cluster"
            style={{
              justifyContent: "flex-end",
              marginBottom: "var(--space-4)",
            }}
          >
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New question
            </Button>
          </div>

          <DataTable
            columns={columns}
            rows={questions}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            searchPlaceholder="Search question prompts..."
            emptyTitle="No questions yet."
            actions={(row) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(row)}
                aria-label="Edit question"
              >
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal
        isOpen={editing !== null}
        onClose={closeEditor}
        title={editing === "new" ? "New question" : "Edit question"}
      >
        <form
          className="stack"
          style={{ gap: "var(--space-4)" }}
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <Select
            label="Topic (optional)"
            placeholder="No specific topic"
            value={form.topicId}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                topicId: event.target.value,
              }))
            }
            options={topics.map((topic) => ({
              value: topic.id,
              label: topic.title,
            }))}
          />

          {editing === "new" && (
            <Select
              label="Question type"
              value={form.questionType}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  questionType: event.target.value as QuestionType,
                }))
              }
              options={QUESTION_TYPE_OPTIONS}
            />
          )}

          <Textarea
            label="Prompt"
            required
            rows={3}
            value={form.prompt}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                prompt: event.target.value,
              }))
            }
          />

          {NEEDS_OPTIONS.includes(form.questionType) && (
            <div
              className="stack"
              style={{ gap: "var(--space-2)" }}
            >
              <span
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                Options (select the correct one)
              </span>

              {options.map((option, index) => (
                <div
                  key={index}
                  className="cluster"
                  style={{ gap: "var(--space-2)" }}
                >
                  <input
                    type="radio"
                    name="correct-option"
                    checked={option.isCorrect}
                    onChange={() => setSingleCorrect(index)}
                    aria-label={`Mark option ${index + 1} correct`}
                  />

                  <input
                    value={option.optionText}
                    onChange={(event) =>
                      updateOption(index, {
                        optionText: event.target.value,
                      })
                    }
                    placeholder={`Option ${index + 1}`}
                    style={{
                      flex: 1,
                      background: "var(--bg-surface-secondary)",
                      border: "1px solid var(--border-glass)",
                      borderRadius: "var(--radius-md)",
                      padding: "var(--space-2) var(--space-3)",
                      color: "var(--text-primary)",
                    }}
                  />

                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label="Remove option"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addOption}
                style={{ alignSelf: "flex-start" }}
              >
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
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  correctAnswerText: event.target.value,
                }))
              }
            />
          )}

          {form.questionType === "structured" && (
            <p
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--text-muted)",
              }}
            >
              Structured questions aren't auto-graded. There's no
              manual-review queue yet, so use sparingly for now.
            </p>
          )}

          <Textarea
            label="Explanation (shown after answering)"
            rows={2}
            value={form.explanation}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                explanation: event.target.value,
              }))
            }
          />

          <Input
            label="Source (optional)"
            value={form.source}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                source: event.target.value,
              }))
            }
          />

          <Select
            label="Difficulty"
            value={form.difficulty}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                difficulty: event.target.value as DifficultyLevel,
              }))
            }
            options={DIFFICULTY_OPTIONS}
          />

          <Input
            label="XP value"
            type="number"
            min={0}
            value={form.xpValue}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                xpValue: Number(event.target.value),
              }))
            }
          />

          {editing !== "new" && (
            <Select
              label="Status"
              value={form.status}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  status: event.target.value as ContentStatus,
                }))
              }
              options={QUESTION_STATUS_OPTIONS}
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
