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
  listProgrammes,
  adminListLevels,
  createLevel,
  updateLevel,
  setLevelActive,
} from "@/services/academic/academicService";
import type { Department, Faculty, Institution, Level, Programme } from "@/types/database.types";

/** Institution -> Faculty -> Department -> Programme -> manage Levels
 * (Master Spec's "IMPORTANT CLARIFICATION": at minimum 100/200/300 Level,
 * but never hardcoded — the Admin defines these here). */
export function AdminLevelsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [facultyId, setFacultyId] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeId, setProgrammeId] = useState("");
  const [levels, setLevels] = useState<Level[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<Level | "new" | null>(null);
  const [form, setForm] = useState({ name: "", numericValue: 100 });
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
  useEffect(() => {
    setProgrammeId("");
    setProgrammes([]);
    if (departmentId) listProgrammes(departmentId).then(setProgrammes).catch(() => showToast("Couldn't load programmes.", "error"));
  }, [departmentId, showToast]);

  async function refresh(progId: string) {
    setIsLoading(true);
    try {
      setLevels(await adminListLevels(progId));
    } catch {
      showToast("Couldn't load levels.", "error");
    } finally {
      setIsLoading(false);
    }
  }
  useEffect(() => {
    if (programmeId) refresh(programmeId);
    else setLevels([]);
  }, [programmeId]);

  function openCreate() {
    setForm({ name: "", numericValue: 100 });
    setEditing("new");
  }
  function openEdit(l: Level) {
    setForm({ name: l.name, numericValue: l.numeric_value });
    setEditing(l);
  }

  async function handleSave() {
    if (!programmeId) return;
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createLevel({ programmeId, name: form.name, numericValue: form.numericValue });
        showToast("Level created.", "success");
      } else if (editing) {
        await updateLevel(editing.id, { name: form.name, numeric_value: form.numericValue });
        showToast("Level updated.", "success");
      }
      setEditing(null);
      await refresh(programmeId);
    } catch {
      showToast("Couldn't save level.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(l: Level) {
    try {
      await setLevelActive(l.id, !l.is_active);
      await refresh(programmeId);
    } catch {
      showToast("Couldn't update level.", "error");
    }
  }

  const columns: DataTableColumn<Level>[] = [
    { key: "name", header: "Name", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "numeric_value", header: "Numeric value", render: (r) => r.numeric_value },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</Badge>,
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-6)" }}>Levels</h1>

      <div className="cluster" style={{ gap: "var(--space-4)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div style={{ minWidth: "200px" }}>
          <Select label="Institution" placeholder="Select" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} options={institutions.map((i) => ({ value: i.id, label: i.name }))} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Faculty" placeholder="Select" value={facultyId} onChange={(e) => setFacultyId(e.target.value)} options={faculties.map((f) => ({ value: f.id, label: f.name }))} disabled={!institutionId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Department" placeholder="Select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} options={departments.map((d) => ({ value: d.id, label: d.name }))} disabled={!facultyId} />
        </div>
        <div style={{ minWidth: "200px" }}>
          <Select label="Programme" placeholder="Select" value={programmeId} onChange={(e) => setProgrammeId(e.target.value)} options={programmes.map((p) => ({ value: p.id, label: p.name }))} disabled={!departmentId} />
        </div>
      </div>

      {programmeId && (
        <>
          <div className="cluster" style={{ justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} /> New level
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={levels}
            rowKey={(r) => r.id}
            isLoading={isLoading}
            searchPlaceholder="Search levels..."
            emptyTitle="No levels yet."
            emptyDescription='Create 100 Level, 200 Level, 300 Level, etc. for this programme.'
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

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New level" : "Edit level"}>
        <form className="stack" style={{ gap: "var(--space-4)" }} onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <Input label="Name" placeholder="e.g. 100 Level" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input
            label="Numeric value"
            type="number"
            min={1}
            required
            hint="Used for ordering, e.g. 100, 200, 300."
            value={form.numericValue}
            onChange={(e) => setForm((f) => ({ ...f, numericValue: Number(e.target.value) }))}
          />
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
