import { useEffect, useState } from "react";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  listInstitutions,
  listFaculties,
  adminListDepartments,
  createDepartment,
  updateDepartment,
  setDepartmentActive,
} from "@/services/academic/academicService";
import type { Department, Faculty, Institution } from "@/types/database.types";

/** Institution -> Faculty -> manage Departments. */
export function AdminDepartmentsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Department | "new" | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);

  useEffect(() => {
    setFacultyId("");
    setFaculties([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
  }, [institutionId, showToast]);

  async function refresh(fId: string) {
    setIsLoading(true);
    try {
      setDepartments(await adminListDepartments(fId));
    } catch {
      showToast("Couldn't load departments.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (facultyId) refresh(facultyId);
    else setDepartments([]);
  }, [facultyId]);

  function openCreate() {
    setForm({ name: "", code: "" });
    setEditing("new");
  }
  function openEdit(d: Department) {
    setForm({ name: d.name, code: d.code ?? "" });
    setEditing(d);
  }

  async function handleSave() {
    if (!facultyId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createDepartment({ facultyId, name: form.name, code: form.code });
        showToast("Department created.", "success");
      } else if (editing) {
        await updateDepartment(editing.id, { name: form.name, code: form.code });
        showToast("Department updated.", "success");
      }
      setEditing(null);
      await refresh(facultyId);
    } catch {
      showToast("Couldn't save department.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(d: Department) {
    try {
      await setDepartmentActive(d.id, !d.is_active);
      await refresh(facultyId);
    } catch {
      showToast("Couldn't update department.", "error");
    }
  }

  const columns: DataTableColumn<Department>[] = [
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
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Departments</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "240px" }}>
          <Select
            label="Institution"
            placeholder="Select an institution"
            value={institutionId}
            onChange={(e) => setInstitutionId(e.target.value)}
            options={institutions.map((i) => ({ value: i.id, label: i.name }))}
          />
        </div>
        <div style={{ minWidth: "240px" }}>
          <Select
            label="Faculty"
            placeholder="Select a faculty"
            value={facultyId}
            onChange={(e) => setFacultyId(e.target.value)}
            options={faculties.map((f) => ({ value: f.id, label: f.name }))}
            disabled={!institutionId}
          />
        </div>
      </div>

      {facultyId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New department
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={departments}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search departments..."
            emptyTitle="No departments yet."
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

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New department" : "Edit department"}>
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
