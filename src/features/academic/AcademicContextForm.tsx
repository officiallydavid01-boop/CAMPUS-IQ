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
 * The cascading Institution -> Faculty -> Department -> Programme ->
 * Level -> Session -> Semester selector required by:
 *   - onboarding (first-time setup)
 *   - Settings -> Academic Profile -> "Change Academic Context"
 * (same component, two call sites — see pages/onboarding/OnboardingPage.tsx
 * and pages/settings/AcademicProfilePage.tsx). Selecting a parent always
 * re-queries and resets every dropdown below it, so it is never possible
 * to submit a combination whose parent/child links don't actually match —
 * the same invariant validate_profile_academic_context() (migration 004)
 * enforces server-side as a second, authoritative line of defense.
 */
export function AcademicContextForm({ initialContext, submitLabel, onSubmit }: AcademicContextFormProps) {
  const { showToast } = useToast();

  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);

  const [institutionId, setInstitutionId] = useState(initialContext?.institutionId ?? "");
  const [facultyId, setFacultyId] = useState(initialContext?.facultyId ?? "");
  const [departmentId, setDepartmentId] = useState(initialContext?.departmentId ?? "");
  const [programmeId, setProgrammeId] = useState(initialContext?.programmeId ?? "");
  const [levelId, setLevelId] = useState(initialContext?.levelId ?? "");
  const [sessionId, setSessionId] = useState(initialContext?.sessionId ?? "");
  const [semesterId, setSemesterId] = useState(initialContext?.semesterId ?? "");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);

  useEffect(() => {
    if (!institutionId) return;
    setIsLoadingLists(true);
    Promise.all([listFaculties(institutionId), listAcademicSessions(institutionId)])
      .then(([f, s]) => {
        setFaculties(f);
        setSessions(s);
      })
      .catch(() => showToast("Couldn't load faculties/sessions.", "error"))
      .finally(() => setIsLoadingLists(false));
  }, [institutionId, showToast]);

  useEffect(() => {
    if (!facultyId) return;
    listDepartments(facultyId).catch(() => showToast("Couldn't load departments.", "error")).then((d) => d && setDepartments(d));
  }, [facultyId, showToast]);

  useEffect(() => {
    if (!departmentId) return;
    listProgrammes(departmentId).catch(() => showToast("Couldn't load programmes.", "error")).then((p) => p && setProgrammes(p));
  }, [departmentId, showToast]);

  useEffect(() => {
    if (!programmeId) return;
    listLevels(programmeId).catch(() => showToast("Couldn't load levels.", "error")).then((l) => l && setLevels(l));
  }, [programmeId, showToast]);

  useEffect(() => {
    if (!sessionId) return;
    listSemesters(sessionId).catch(() => showToast("Couldn't load semesters.", "error")).then((s) => s && setSemesters(s));
  }, [sessionId, showToast]);

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

  function handleFacultyChange(value: string) {
    setFacultyId(value);
    setDepartmentId("");
    setProgrammeId("");
    setLevelId("");
    setDepartments([]);
    setProgrammes([]);
    setLevels([]);
  }

  function handleDepartmentChange(value: string) {
    setDepartmentId(value);
    setProgrammeId("");
    setLevelId("");
    setProgrammes([]);
    setLevels([]);
  }

  function handleProgrammeChange(value: string) {
    setProgrammeId(value);
    setLevelId("");
    setLevels([]);
  }

  function handleSessionChange(value: string) {
    setSessionId(value);
    setSemesterId("");
    setSemesters([]);
  }

  const isComplete = Boolean(institutionId && facultyId && departmentId && programmeId && levelId && sessionId && semesterId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isComplete) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ institutionId, facultyId, departmentId, programmeId, levelId, sessionId, semesterId });
    } catch {
      showToast("Couldn't save your academic context. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="stack" style={{ gap: "var(--space-5)" }}>
      <Select
        label="Institution"
        placeholder="Select your institution"
        value={institutionId}
        onChange={(e) => handleInstitutionChange(e.target.value)}
        options={institutions.map((i) => ({ value: i.id, label: i.name }))}
        required
      />
      <Select
        label="Faculty"
        placeholder="Select your faculty"
        value={facultyId}
        onChange={(e) => handleFacultyChange(e.target.value)}
        options={faculties.map((f) => ({ value: f.id, label: f.name }))}
        disabled={!institutionId || isLoadingLists}
        required
      />
      <Select
        label="Department"
        placeholder="Select your department"
        value={departmentId}
        onChange={(e) => handleDepartmentChange(e.target.value)}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        disabled={!facultyId}
        required
      />
      <Select
        label="Programme"
        placeholder="Select your programme"
        value={programmeId}
        onChange={(e) => handleProgrammeChange(e.target.value)}
        options={programmes.map((p) => ({ value: p.id, label: p.name }))}
        disabled={!departmentId}
        required
      />
      <Select
        label="Level"
        placeholder="Select your level"
        value={levelId}
        onChange={(e) => setLevelId(e.target.value)}
        options={levels.map((l) => ({ value: l.id, label: l.name }))}
        disabled={!programmeId}
        required
      />
      <Select
        label="Academic session"
        placeholder="Select the academic session"
        value={sessionId}
        onChange={(e) => handleSessionChange(e.target.value)}
        options={sessions.map((s) => ({ value: s.id, label: s.name }))}
        disabled={!institutionId}
        required
      />
      <Select
        label="Semester"
        placeholder="Select the semester"
        value={semesterId}
        onChange={(e) => setSemesterId(e.target.value)}
        options={semesters.map((s) => ({ value: s.id, label: s.name }))}
        disabled={!sessionId}
        required
      />

      <Button type="submit" isLoading={isSubmitting} disabled={!isComplete}>
        {submitLabel}
      </Button>
    </form>
  );
}
