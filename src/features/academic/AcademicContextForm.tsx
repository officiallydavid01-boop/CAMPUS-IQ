
import { useEffect, useState, type FormEvent } from "react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listFaculties,
  listDepartments,
  listProgrammes,
  listLevels,
  listAcademicSessions,
  listSemesters,
  type AcademicContext,
} from "@/services/academic/academicService";
import type {
  Institution,
  Faculty,
  Department,
  Programme,
  Level,
  AcademicSession,
  Semester,
} from "@/types/database.types";

interface AcademicContextFormProps {
  initialContext?: Partial<AcademicContext>;
  submitLabel: string;
  onSubmit: (context: AcademicContext) => Promise<void>;
}

/**
 * Cascading academic context selector used by:
 * - First-time onboarding
 * - Settings -> Academic Profile
 *
 * Saved selections are initialized from initialContext.
 * Changing a parent selection clears its dependent selections.
 * Request cancellation guards prevent outdated responses from
 * replacing options belonging to a newer selection.
 */
export function AcademicContextForm({
  initialContext,
  submitLabel,
  onSubmit,
}: AcademicContextFormProps) {
  const { showToast } = useToast();

  // Available dropdown options
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  // Preserve the existing saved academic context on initialization.
  const [institutionId, setInstitutionId] = useState(
    initialContext?.institutionId ?? ""
  );
  const [facultyId, setFacultyId] = useState(
    initialContext?.facultyId ?? ""
  );
  const [departmentId, setDepartmentId] = useState(
    initialContext?.departmentId ?? ""
  );
  const [programmeId, setProgrammeId] = useState(
    initialContext?.programmeId ?? ""
  );
  const [levelId, setLevelId] = useState(
    initialContext?.levelId ?? ""
  );
  const [sessionId, setSessionId] = useState(
    initialContext?.sessionId ?? ""
  );
  const [semesterId, setSemesterId] = useState(
    initialContext?.semesterId ?? ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  // Load active institutions.
  useEffect(() => {
    let cancelled = false;

    listInstitutions()
      .then((items) => {
        if (!cancelled) {
          setInstitutions(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load institutions.", "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // Load faculties and sessions for the selected institution.
  useEffect(() => {
    let cancelled = false;

    if (!institutionId) {
      setFaculties([]);
      setSessions([]);
      setIsLoadingLists(false);

      return () => {
        cancelled = true;
      };
    }

    setIsLoadingLists(true);

    Promise.all([
      listFaculties(institutionId),
      listAcademicSessions(institutionId),
    ])
      .then(([facultyItems, sessionItems]) => {
        if (cancelled) return;

        setFaculties(facultyItems);
        setSessions(sessionItems);
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load faculties/sessions.", "error");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingLists(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, showToast]);

  // Load departments for the selected faculty.
  useEffect(() => {
    let cancelled = false;

    if (!facultyId) {
      setDepartments([]);

      return () => {
        cancelled = true;
      };
    }

    listDepartments(facultyId)
      .then((items) => {
        if (!cancelled) {
          setDepartments(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load departments.", "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [facultyId, showToast]);

  // Load programmes for the selected department.
  useEffect(() => {
    let cancelled = false;

    if (!departmentId) {
      setProgrammes([]);

      return () => {
        cancelled = true;
      };
    }

    listProgrammes(departmentId)
      .then((items) => {
        if (!cancelled) {
          setProgrammes(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load programmes.", "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [departmentId, showToast]);

  // Load levels for the selected programme.
  useEffect(() => {
    let cancelled = false;

    if (!programmeId) {
      setLevels([]);

      return () => {
        cancelled = true;
      };
    }

    listLevels(programmeId)
      .then((items) => {
        if (!cancelled) {
          setLevels(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load levels.", "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [programmeId, showToast]);

  // Load semesters for the selected academic session.
  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      setSemesters([]);

      return () => {
        cancelled = true;
      };
    }

    listSemesters(sessionId)
      .then((items) => {
        if (!cancelled) {
          setSemesters(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          showToast("Couldn't load semesters.", "error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId, showToast]);

  // Institution changes invalidate every dependent selection.
  function handleInstitutionChange(value: string) {
    setInstitutionId(value);

    setFacultyId("");
    setDepartmentId("");
    setProgrammeId("");
    setLevelId("");
    setSessionId("");
    setSemesterId("");

    setFaculties([]);
    setDepartments([]);
    setProgrammes([]);
    setLevels([]);
    setSessions([]);
    setSemesters([]);
  }

  // Faculty changes invalidate its dependent selections.
  function handleFacultyChange(value: string) {
    setFacultyId(value);

    setDepartmentId("");
    setProgrammeId("");
    setLevelId("");

    setDepartments([]);
    setProgrammes([]);
    setLevels([]);
  }

  // Department changes invalidate its dependent selections.
  function handleDepartmentChange(value: string) {
    setDepartmentId(value);

    setProgrammeId("");
    setLevelId("");

    setProgrammes([]);
    setLevels([]);
  }

  // Programme changes invalidate the selected level.
  function handleProgrammeChange(value: string) {
    setProgrammeId(value);
    setLevelId("");
    setLevels([]);
  }

  // Session changes invalidate the selected semester.
  function handleSessionChange(value: string) {
    setSessionId(value);
    setSemesterId("");
    setSemesters([]);
  }

  const isComplete = Boolean(
    institutionId &&
      facultyId &&
      departmentId &&
      programmeId &&
      levelId &&
      sessionId &&
      semesterId
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);

    try {
      await onSubmit({
        institutionId,
        facultyId,
        departmentId,
        programmeId,
        levelId,
        sessionId,
        semesterId,
      });
    } catch {
      showToast(
        "Couldn't save your academic context. Please try again.",
        "error"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="stack"
      style={{ gap: "var(--space-5)" }}
    >
      <Select
        label="Institution"
        placeholder="Select your institution"
        value={institutionId}
        onChange={(e) => handleInstitutionChange(e.target.value)}
        options={institutions.map((institution) => ({
          value: institution.id,
          label: institution.name,
        }))}
        required
      />

      <Select
        label="Faculty"
        placeholder="Select your faculty"
        value={facultyId}
        onChange={(e) => handleFacultyChange(e.target.value)}
        options={faculties.map((faculty) => ({
          value: faculty.id,
          label: faculty.name,
        }))}
        disabled={!institutionId || isLoadingLists}
        required
      />

      <Select
        label="Department"
        placeholder="Select your department"
        value={departmentId}
        onChange={(e) => handleDepartmentChange(e.target.value)}
        options={departments.map((department) => ({
          value: department.id,
          label: department.name,
        }))}
        disabled={!facultyId}
        required
      />

      <Select
        label="Programme"
        placeholder="Select your programme"
        value={programmeId}
        onChange={(e) => handleProgrammeChange(e.target.value)}
        options={programmes.map((programme) => ({
          value: programme.id,
          label: programme.name,
        }))}
        disabled={!departmentId}
        required
      />

      <Select
        label="Level"
        placeholder="Select your level"
        value={levelId}
        onChange={(e) => setLevelId(e.target.value)}
        options={levels.map((level) => ({
          value: level.id,
          label: level.name,
        }))}
        disabled={!programmeId}
        required
      />

      <Select
        label="Academic session"
        placeholder="Select the academic session"
        value={sessionId}
        onChange={(e) => handleSessionChange(e.target.value)}
        options={sessions.map((session) => ({
          value: session.id,
          label: session.name,
        }))}
        disabled={!institutionId}
        required
      />

      <Select
        label="Semester"
        placeholder="Select the semester"
        value={semesterId}
        onChange={(e) => setSemesterId(e.target.value)}
        options={semesters.map((semester) => ({
          value: semester.id,
          label: semester.name,
        }))}
        disabled={!sessionId}
        required
      />

      <Button
        type="submit"
        isLoading={isSubmitting}
        disabled={!isComplete || isSubmitting}
      >
        {submitLabel}
      </Button>
    </form>
  );
}
