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
  listDepartments,
  adminListProgrammes,
  createProgramme,
  updateProgramme,
  setProgrammeActive,
} from "@/services/academic/academicService";
import type { Department, Faculty, Institution, Programme } from "@/types/database.types";

/** Institution -> Faculty -> Department -> manage Programmes. */
export function AdminProgrammesPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Programme | "new" | null>(null);
  const [form, setForm] = useState({ name: "", code: "", degreeType: "", durationYears: 4 });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listInstitutions().then(setInstitutions).catch(() => showToast("Couldn't load institutions.", "error"));
  }, [showToast]);
  useEffect(() => {
    setFacultyId("");
    setFaculties([]);
    if (institutionId) listFaculties(institutionId).then(setFaculties).catch(() => showToast("Couldn't load faculties.", "error"));
  }, [institutionId, showToast]);
  useEffect(() => {
    setDepartmentId("");
    setDepartments([]);
    if (facultyId) listDepartments(facultyId).then(setDepartments).catch(() => showToast("Couldn't load departments.", "error"));
  }, [facultyId, showToast]);

  async function refresh(deptId: string) {
    setIsLoading(true);
    try {
      setProgrammes(await adminListProgrammes(deptId));
    } catch {
      showToast("Couldn't load programmes.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (departmentId) refresh(departmentId);
    else setProgrammes([]);
  }, [departmentId]);

  function openCreate() {
    setForm({ name: "", code: "", degreeType: "", durationYears: 4 });
    setEditing("new");
  }
  function openEdit(p: Programme) {
    setForm({ name: p.name, code: p.code ?? "", degreeType: p.degree_type ?? "", durationYears: p.duration_years });
    setEditing(p);
  }

  async function handleSave() {
    if (!departmentId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createProgramme({
          departmentId,
          name: form.name,
          code: form.code,
          degreeType: form.degreeType,
          durationYears: form.durationYears,
        });
        showToast("Programme created.", "success");
      } else if (editing) {
        await updateProgramme(editing.id, {
          name: form.name,
          code: form.code,
          degree_type: form.degreeType,
          duration_years: form.durationYears,
        });
        showToast("Programme updated.", "success");
      }
      setEditing(null);
      await refresh(departmentId);
    } catch {
      showToast("Couldn't save programme.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(p: Programme) {
    try {
      await setProgrammeActive(p.id, !p.is_active);
      await refresh(departmentId);
    } catch {
      showToast("Couldn't update programme.", "error");
    }
  }

  const columns: DataTableColumn<Programme>[] = [
    { key: "name", header: "Name", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "code", header: "Code", render: (r) => r.code ?? "—" },
    { key: "duration", header: "Duration", render: (r) => `${r.duration_years} yrs` },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</Badge>,
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Programmes</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "220px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "220px" }}>
          <Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "220px" }}>
          <Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
      </div>

      {departmentId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New programme
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={programmes}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search programmes..."
            emptyTitle="No programmes yet."
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

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New programme" : "Edit programme"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          <Input label="Degree type" placeholder="e.g. Bachelor" value={form.degreeType} onChange={(e) => setForm((f) => ({ ...f, degreeType: e.target.value }))} />
          <Input
            label="Duration (years)"
            type="number"
            min={1}
            max={10}
            required
            value={form.durationYears}
            onChange={(e) => setForm((f) => ({ ...f, durationYears: Number(e.target.value) }))}
          />
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
