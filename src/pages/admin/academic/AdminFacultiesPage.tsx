import { useEffect, useState } from "react";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { listInstitutions } from "@/services/academic/academicService";
import { adminListFaculties, createFaculty, updateFaculty, setFacultyActive } from "@/services/academic/academicService";
import type { Faculty, Institution } from "@/types/database.types";

/** Pick an Institution, then manage its Faculties (Master Spec section 74
 * Admin content tree: Institution -> Faculty). */
export function AdminFacultiesPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Faculty | "new" | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);

  async function refresh(instId: string) {
    setIsLoading(true);
    try {
      setFaculties(await adminListFaculties(instId));
    } catch {
      showToast("Couldn't load faculties.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (institutionId) refresh(institutionId);
    else setFaculties([]);
  }, [institutionId]);

  function openCreate() {
    setForm({ name: "", code: "" });
    setEditing("new");
  }
  function openEdit(f: Faculty) {
    setForm({ name: f.name, code: f.code ?? "" });
    setEditing(f);
  }

  async function handleSave() {
    if (!institutionId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createFaculty({ institutionId, name: form.name, code: form.code });
        showToast("Faculty created.", "success");
      } else if (editing) {
        await updateFaculty(editing.id, { name: form.name, code: form.code });
        showToast("Faculty updated.", "success");
      }
      setEditing(null);
      await refresh(institutionId);
    } catch {
      showToast("Couldn't save faculty.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(f: Faculty) {
    try {
      await setFacultyActive(f.id, !f.is_active);
      await refresh(institutionId);
    } catch {
      showToast("Couldn't update faculty.", "error");
    }
  }

  const columns: DataTableColumn<Faculty>[] = [
    { key: "name", header: "Name", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "code", header: "Code", render: (r) => r.code ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</Badge>,
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Faculties</h1>

      <div style={{ maxWidth: "320px", marginBottom: "var(--space-6)" }}>
        <Select
          label="Institution"
          placeholder="Select an institution"
          value={institutionId}
          onChange={(e) => setInstitutionId(e.target.value)}
          options={institutions.map((i) => ({ value: i.id, label: i.name }))}
        />
      </div>

      {institutionId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New faculty
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={faculties}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search faculties..."
            emptyTitle="No faculties yet."
            actions={(r) => (
              <>
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)} aria-label={`Edit ${r.name}`}>
                  <Pencil size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(r)} aria-label={r.is_active ? `Archive ${r.name}` : `Restore ${r.name}`}>
                  {r.is_active ? <Archive size={14} /> : <RotateCcw size={14} />}
                </Button>
              </>
            )}
          />
        </>
      )}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New faculty" : "Edit faculty"}>
        <form
          className="stack"
          style={{ gap: "var(--space-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
