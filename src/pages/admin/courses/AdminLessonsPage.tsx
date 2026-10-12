
import { useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft } from "@/utils/draftstorage";
import { Plus, Pencil } from "lucide-react";
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
} from "@/services/academic/academicService";
import { adminListCourses } from "@/services/courses/adminCoursesService";
import { adminListTopics } from "@/services/courses/adminContentService";
import {
  adminListLessons,
  createLesson,
  updateLesson,
  CONTENT_STATUS_OPTIONS,
  type LessonInput,
} from "@/services/courses/adminContentService";
import type {
  ContentStatus,
  Course,
  CourseTopic,
  Department,
  Faculty,
  Institution,
  Lesson,
} from "@/types/database.types";

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

type LessonDraft = {
  topicId: string;
  lessonId: string | null;
  form: typeof emptyForm;
};

type LessonSelectionDraft = {
  institutionId: string;
  facultyId: string;
  departmentId: string;
  courseId: string;
  topicId: string;
};

const LESSON_SELECTION_DRAFT_KEY = "lesson-selections";

function getLessonDraftKey(topicId: string, lessonId: string | null): string {
  return `lesson:${topicId}:${lessonId ?? "new"}`;
}

function saveLessonSelections(data: LessonSelectionDraft): void {
  saveDraft(LESSON_SELECTION_DRAFT_KEY, data);
}

function loadLessonSelections(): LessonSelectionDraft | null {
  return loadDraft<LessonSelectionDraft>(LESSON_SELECTION_DRAFT_KEY)?.data ?? null;
}

/** Institution -> Faculty -> Department -> Course -> Topic -> Lessons. */
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

  const draftKeyRef = useRef<string | null>(null);

  // Holds the saved selections until the dependent dropdowns are restored.
  const restoreRef = useRef<LessonSelectionDraft | null>(
    loadLessonSelections()
  );

  // Prevent older network responses from replacing newer dropdown choices.
  const requestVersions = useRef({
    institutions: 0,
    faculties: 0,
    departments: 0,
    courses: 0,
    topics: 0,
    lessons: 0,
  });

  // Persist academic selections, except while the saved hierarchy is restoring.
  useEffect(() => {
    if (restoreRef.current) return;

    saveLessonSelections({
      institutionId,
      facultyId,
      departmentId,
      courseId,
      topicId,
    });
  }, [institutionId, facultyId, departmentId, courseId, topicId]);

  // Automatically save the unfinished lesson form on every change.
  useEffect(() => {
    if (editing === null || !topicId || !draftKeyRef.current) return;

    const key = draftKeyRef.current;
    const lessonId = editing === "new" ? null : editing.id;

    saveDraft<LessonDraft>(key, {
      topicId,
      lessonId,
      form,
    });
  }, [form, editing, topicId]);

  // Load institutions, then begin restoring the saved selection hierarchy.
  useEffect(() => {
    let active = true;
    const version = ++requestVersions.current.institutions;

    listInstitutions()
      .then((rows) => {
        if (!active || version !== requestVersions.current.institutions) return;

        setInstitutions(rows);

        const saved = restoreRef.current;
        if (saved?.institutionId && rows.some((row) => row.id === saved.institutionId)) {
          setInstitutionId(saved.institutionId);
        } else if (saved) {
          restoreRef.current = null;
        }
      })
      .catch(() => {
        if (active) {
          restoreRef.current = null;
          showToast("Couldn't load institutions.", "error");
        }
      });

    return () => {
      active = false;
    };
  }, [showToast]);

  // Institution -> Faculty
  useEffect(() => {
    const version = ++requestVersions.current.faculties;
    const saved = restoreRef.current;

    setFacultyId("");
    setFaculties([]);
    setDepartmentId("");
    setDepartments([]);
    setCourseId("");
    setCourses([]);
    setTopicId("");
    setTopics([]);
    setLessons([]);

    if (!institutionId) return;

    let active = true;

    listFaculties(institutionId)
      .then((rows) => {
        if (!active || version !== requestVersions.current.faculties) return;

        setFaculties(rows);

        if (saved && saved.institutionId === institutionId) {
          if (saved.facultyId && rows.some((row) => row.id === saved.facultyId)) {
            setFacultyId(saved.facultyId);
          } else {
            restoreRef.current = null;
          }
        }
      })
      .catch(() => {
        if (active) {
          if (restoreRef.current?.institutionId === institutionId) {
            restoreRef.current = null;
          }
          showToast("Couldn't load faculties.", "error");
        }
      });

    return () => {
      active = false;
    };
  }, [institutionId, showToast]);

  // Faculty -> Department
  useEffect(() => {
    const version = ++requestVersions.current.departments;
    const saved = restoreRef.current;

    setDepartmentId("");
    setDepartments([]);
    setCourseId("");
    setCourses([]);
    setTopicId("");
    setTopics([]);
    setLessons([]);

    if (!facultyId) return;

    let active = true;

    listDepartments(facultyId)
      .then((rows) => {
        if (!active || version !== requestVersions.current.departments) return;

        setDepartments(rows);

        if (saved && saved.facultyId === facultyId) {
          if (saved.departmentId && rows.some((row) => row.id === saved.departmentId)) {
            setDepartmentId(saved.departmentId);
          } else {
            restoreRef.current = null;
          }
        }
      })
      .catch(() => {
        if (active) {
          if (restoreRef.current?.facultyId === facultyId) {
            restoreRef.current = null;
          }
          showToast("Couldn't load departments.", "error");
        }
      });

    return () => {
      active = false;
    };
  }, [facultyId, showToast]);

  // Department -> Course
  useEffect(() => {
    const version = ++requestVersions.current.courses;
    const saved = restoreRef.current;

    setCourseId("");
    setCourses([]);
    setTopicId("");
    setTopics([]);
    setLessons([]);

    if (!departmentId) return;

    let active = true;

    adminListCourses(departmentId)
      .then((rows) => {
        if (!active || version !== requestVersions.current.courses) return;

        setCourses(rows);

        if (saved && saved.departmentId === departmentId) {
          if (saved.courseId && rows.some((row) => row.id === saved.courseId)) {
            setCourseId(saved.courseId);
          } else {
            restoreRef.current = null;
          }
        }
      })
      .catch(() => {
        if (active) {
          if (restoreRef.current?.departmentId === departmentId) {
            restoreRef.current = null;
          }
          showToast("Couldn't load courses.", "error");
        }
      });

    return () => {
      active = false;
    };
  }, [departmentId, showToast]);

  // Course -> Topic
  useEffect(() => {
    const version = ++requestVersions.current.topics;
    const saved = restoreRef.current;

    setTopicId("");
    setTopics([]);
    setLessons([]);

    if (!courseId) return;

    let active = true;

    adminListTopics(courseId)
      .then((rows) => {
        if (!active || version !== requestVersions.current.topics) return;

        setTopics(rows);

        if (saved && saved.courseId === courseId) {
          if (saved.topicId && rows.some((row) => row.id === saved.topicId)) {
            setTopicId(saved.topicId);
          } else {
            restoreRef.current = null;
          }
        }

        // The hierarchy is restored or the saved path is no longer valid.
        if (restoreRef.current?.courseId === courseId) {
          restoreRef.current = null;
        }
      })
      .catch(() => {
        if (active) {
          if (restoreRef.current?.courseId === courseId) {
            restoreRef.current = null;
          }
          showToast("Couldn't load topics.", "error");
        }
      });

    return () => {
      active = false;
    };
  }, [courseId, showToast]);

  async function refresh(tId: string) {
    const version = ++requestVersions.current.lessons;
    setIsLoading(true);

    try {
      const rows = await adminListLessons(tId);

      if (version === requestVersions.current.lessons) {
        setLessons(rows);
      }
    } catch {
      if (version === requestVersions.current.lessons) {
        showToast("Couldn't load lessons.", "error");
      }
    } finally {
      if (version === requestVersions.current.lessons) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (topicId) {
      void refresh(topicId);
    } else {
      requestVersions.current.lessons += 1;
      setLessons([]);
      setIsLoading(false);
    }
  }, [topicId]);

  function openCreate() {
    if (!topicId) return;

    const key = getLessonDraftKey(topicId, null);
    const draft = loadDraft<LessonDraft>(key);
    const initialForm = {
      ...emptyForm,
      displayOrder: lessons.length,
    };

    draftKeyRef.current = key;

    if (draft && draft.data.topicId === topicId && draft.data.lessonId === null) {
      setForm(draft.data.form);
      showToast("Unsaved lesson draft restored.", "success");
    } else {
      setForm(initialForm);
    }

    setEditing("new");
  }

  function openEdit(lesson: Lesson) {
    if (!topicId) return;

    const key = getLessonDraftKey(topicId, lesson.id);
    const draft = loadDraft<LessonDraft>(key);

    const savedForm = {
      title: lesson.title,
      introduction: lesson.introduction ?? "",
      coreConcept: lesson.core_concept ?? "",
      detailedExplanation: lesson.detailed_explanation ?? "",
      examples: lesson.examples ?? "",
      formulas: lesson.formulas ?? "",
      notes: lesson.notes ?? "",
      estimatedReadingMinutes: lesson.estimated_reading_minutes ?? 5,
      displayOrder: lesson.display_order,
      status: lesson.status,
    };

    draftKeyRef.current = key;

    if (draft && draft.data.topicId === topicId && draft.data.lessonId === lesson.id) {
      setForm(draft.data.form);
      showToast("Unsaved lesson draft restored.", "success");
    } else {
      setForm(savedForm);
    }

    setEditing(lesson);
  }

  function closeEditor() {
    setEditing(null);
    draftKeyRef.current = null;
    // Keep the saved draft so it can be recovered if the editor is reopened.
  }

  async function handleSave() {
    if (!topicId || !editing) return;

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
      } else {
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

      if (draftKeyRef.current) {
        clearDraft(draftKeyRef.current);
        draftKeyRef.current = null;
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
    { key: "order", header: "#", render: (row) => row.display_order },
    {
      key: "title",
      header: "Title",
      render: (row) => row.title,
      searchValue: (row) => row.title,
    },
    {
      key: "minutes",
      header: "Read time",
      render: (row) =>
        row.estimated_reading_minutes ? `${row.estimated_reading_minutes} min` : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>
        Lessons
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
            onChange={(event) => {
              restoreRef.current = null;
              setInstitutionId(event.target.value);
            }}
            options={institutions.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        </div>

        <div style={{ minWidth: "180px" }}>
          <Select
            label="Faculty"
            placeholder="Select"
            value={facultyId}
            onChange={(event) => {
              restoreRef.current = null;
              setFacultyId(event.target.value);
            }}
            options={faculties.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            disabled={!institutionId}
          />
        </div>

        <div style={{ minWidth: "180px" }}>
          <Select
            label="Department"
            placeholder="Select"
            value={departmentId}
            onChange={(event) => {
              restoreRef.current = null;
              setDepartmentId(event.target.value);
            }}
            options={departments.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            disabled={!facultyId}
          />
        </div>

        <div style={{ minWidth: "200px" }}>
          <Select
            label="Course"
            placeholder="Select"
            value={courseId}
            onChange={(event) => {
              restoreRef.current = null;
              setCourseId(event.target.value);
            }}
            options={courses.map((item) => ({
              value: item.id,
              label: item.course_code,
            }))}
            disabled={!departmentId}
          />
        </div>

        <div style={{ minWidth: "200px" }}>
          <Select
            label="Topic"
            placeholder="Select"
            value={topicId}
            onChange={(event) => {
              restoreRef.current = null;
              setTopicId(event.target.value);
            }}
            options={topics.map((item) => ({
              value: item.id,
              label: item.title,
            }))}
            disabled={!courseId}
          />
        </div>
      </div>

      {topicId && (
        <>
          <div
            className="cluster"
            style={{
              justifyContent: "flex-end",
              marginBottom: "var(--space-4)",
            }}
          >
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New lesson
            </Button>
          </div>

          <DataTable
            columns={columns}
            rows={lessons}
            rowKey={(row) => row.id}
            isLoading={isLoading}
            searchPlaceholder="Search lessons..."
            emptyTitle="No lessons yet."
            actions={(row) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openEdit(row)}
                aria-label={`Edit ${row.title}`}
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
        title={editing === "new" ? "New lesson" : "Edit lesson"}
      >
        <form
          className="stack"
          style={{ gap: "var(--space-4)" }}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <Input
            label="Title"
            required
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />

          <Textarea
            label="Introduction"
            rows={2}
            value={form.introduction}
            onChange={(event) =>
              setForm((current) => ({ ...current, introduction: event.target.value }))
            }
          />

          <Textarea
            label="Core concept"
            rows={2}
            value={form.coreConcept}
            onChange={(event) =>
              setForm((current) => ({ ...current, coreConcept: event.target.value }))
            }
          />

          <Textarea
            label="Detailed explanation"
            rows={5}
            value={form.detailedExplanation}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                detailedExplanation: event.target.value,
              }))
            }
          />

          <Textarea
            label="Examples"
            rows={3}
            value={form.examples}
            onChange={(event) =>
              setForm((current) => ({ ...current, examples: event.target.value }))
            }
          />

          <Textarea
            label="Formulas"
            rows={2}
            value={form.formulas}
            onChange={(event) =>
              setForm((current) => ({ ...current, formulas: event.target.value }))
            }
          />

          <Textarea
            label="Notes"
            rows={2}
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
          />

          <Input
            label="Estimated reading time (minutes)"
            type="number"
            min={1}
            value={form.estimatedReadingMinutes}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                estimatedReadingMinutes: Number(event.target.value),
              }))
            }
          />

          <Input
            label="Display order"
            type="number"
            min={0}
            value={form.displayOrder}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                displayOrder: Number(event.target.value),
              }))
            }
          />

          {editing !== "new" && (
            <Select
              label="Status"
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  status: event.target.value as ContentStatus,
                }))
              }
              options={CONTENT_STATUS_OPTIONS}
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
