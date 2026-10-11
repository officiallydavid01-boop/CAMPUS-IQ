import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listAcademicSessions,
  listSemesters,
  createSemester,
  updateSemester,
} from "@/services/academic/academicService";
import type { AcademicSession, Institution, Semester } from "@/types/database.types";

export function AdminSemestersPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Semester | "new" | null>(null);
  const [form, setForm] = useState({ name: "", numericValue: 1, startDate: "", endDate: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setSessionId("");
    setSessions([]);
    if (institutionId) listAcademicSessions(institutionId).then(setSessions).catch(() => showToast("Couldn't load sessions.", "error"));
  }, [institutionId, showToast]);

  async function refresh(sessId: string) {
    setIsLoading(true);
    try {
      setSemesters(await listSemesters(sessId));
    } catch {
      showToast("Couldn't load semesters.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (sessionId) refresh(sessionId);
    else setSemesters([]);
  }, [sessionId]);

  function openCreate() {
    setForm({ name: "", numericValue: 1, startDate: "", endDate: "" });
    setEditing("new");
  }
  function openEdit(s: Semester) {
    setForm({ name: s.name, numericValue: s.numeric_value, startDate: s.start_date ?? "", endDate: s.end_date ?? "" });
    setEditing(s);
  }

  async function handleSave() {
    if (!sessionId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createSemester({
          academicSessionId: sessionId,
          name: form.name,
          numericValue: form.numericValue,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
        });
        showToast("Semester created.", "success");
      } else if (editing) {
        await updateSemester(editing.id, {
          name: form.name,
          numeric_value: form.numericValue,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
        });
        showToast("Semester updated.", "success");
      }
      setEditing(null);
      await refresh(sessionId);
    } catch {
      showToast("Couldn't save semester.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<Semester>[] = [
    { key: "name", header: "Semester", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "numeric_value", header: "#", render: (r) => r.numeric_value },
    { key: "dates", header: "Dates", render: (r) => [r.start_date, r.end_date].filter(Boolean).join(" – ") || "—" },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Semesters</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "240px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "240px" }}>
          <Select label="Academic session" placeholder="Select" value={sessionId} onChange={(e) => setSessionId(e.target.value)} options={sessions.map((s) => ({ value: s.id, label: s.name }))} disabled={!institutionId} />
        </div>
      </div>

      {sessionId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New semester
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={semesters}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search semesters..."
            emptyTitle="No semesters yet."
            emptyDescription='e.g. "First Semester", "Second Semester"'
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New semester" : "Edit semester"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Name" placeholder="e.g. First Semester" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input
            label="Numeric value"
            type="number"
            min={1}
            max={3}
            required
            hint="1 for First Semester, 2 for Second, 3 if your institution uses a third."
            value={form.numericValue}
            onChange={(e) => setForm((f) => ({ ...f, numericValue: Number(e.target.value) }))}
          />
          <Input label="Start date" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="End date" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
