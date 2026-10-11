import { useEffect, useState } from "react";
import { Plus, Pencil, Star } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listAcademicSessions,
  createAcademicSession,
  updateAcademicSession,
} from "@/services/academic/academicService";
import type { AcademicSession, Institution } from "@/types/database.types";

export function AdminSessionsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<AcademicSession | "new" | null>(null);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", isCurrent: false });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);

  async function refresh(instId: string) {
    setIsLoading(true);
    try {
      setSessions(await listAcademicSessions(instId));
    } catch {
      showToast("Couldn't load academic sessions.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (institutionId) refresh(institutionId);
    else setSessions([]);
  }, [institutionId]);

  function openCreate() {
    setForm({ name: "", startDate: "", endDate: "", isCurrent: false });
    setEditing("new");
  }
  function openEdit(s: AcademicSession) {
    setForm({ name: s.name, startDate: s.start_date ?? "", endDate: s.end_date ?? "", isCurrent: s.is_current });
    setEditing(s);
  }

  async function handleSave() {
    if (!institutionId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createAcademicSession({
          institutionId,
          name: form.name,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          isCurrent: form.isCurrent,
        });
        showToast("Academic session created.", "success");
      } else if (editing) {
        await updateAcademicSession(editing.id, {
          name: form.name,
          start_date: form.startDate || null,
          end_date: form.endDate || null,
          is_current: form.isCurrent,
        });
        showToast("Academic session updated.", "success");
      }
      setEditing(null);
      await refresh(institutionId);
    } catch {
      showToast("Couldn't save academic session.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  const columns: DataTableColumn<AcademicSession>[] = [
    { key: "name", header: "Session", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "dates", header: "Dates", render: (r) => [r.start_date, r.end_date].filter(Boolean).join(" – ") || "—" },
    {
      key: "current",
      header: "Current",
      render: (r) => (r.is_current ? <Badge tone="accent"><Star size={12} /> Current</Badge> : "—"),
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Academic sessions</h1>

      <div style={{ maxWidth: "320px", marginBottom: "var(--space-6)" }}>
        <Select label="Institution" placeholder="Select an institution" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
      </div>

      {institutionId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New session
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={sessions}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search sessions..."
            emptyTitle="No academic sessions yet."
            emptyDescription='e.g. "2026/2027"'
            actions={(r) => (
              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
                <Pencil size={14} />
              </Button>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New academic session" : "Edit academic session"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Name" placeholder="e.g. 2026/2027" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Start date" type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
          <Input label="End date" type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          <label className="cluster" style={{ gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm((f) => ({ ...f, isCurrent: e.target.checked }))} />
            Mark as the current session
          </label>
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
