import { useEffect, useState } from "react";
import { Plus, Pencil, Archive, RotateCcw } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  adminListInstitutions,
  createInstitution,
  updateInstitution,
  setInstitutionActive,
} from "@/services/academic/academicService";
import type { Institution } from "@/types/database.types";

/**
 * Top of the academic hierarchy (Master Spec sections 13, 21, 74). No
 * parent selector needed — every other hierarchy page (Faculties,
 * Departments, ...) starts by having the Admin pick one of these.
 */
export function AdminInstitutionsPage() {
  const { showToast } = useToast();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Institution | "new" | null>(null);
  const [form, setForm] = useState({ name: "", shortName: "", country: "", city: "" });
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    setIsLoading(true);
    try {
      setInstitutions(await adminListInstitutions());
    } catch {
      showToast("Couldn't load institutions.", "error");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openCreate() {
    setForm({ name: "", shortName: "", country: "", city: "" });
    setEditing("new");
  }

  function openEdit(inst: Institution) {
    setForm({ name: inst.name, shortName: inst.short_name ?? "", country: inst.country ?? "", city: inst.city ?? "" });
    setEditing(inst);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (editing === "new") {
        await createInstitution({ name: form.name, shortName: form.shortName, country: form.country, city: form.city });
        showToast("Institution created.", "success");
      } else if (editing) {
        await updateInstitution(editing.id, {
          name: form.name,
          short_name: form.shortName,
          country: form.country,
          city: form.city,
        });
        showToast("Institution updated.", "success");
      }
      setEditing(null);
      await refresh();
    } catch {
      showToast("Couldn't save institution.", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(inst: Institution) {
    try {
      await setInstitutionActive(inst.id, !inst.is_active);
      showToast(inst.is_active ? "Institution archived." : "Institution restored.", "success");
      await refresh();
    } catch {
      showToast("Couldn't update institution.", "error");
    }
  }

  const columns: DataTableColumn<Institution>[] = [
    { key: "name", header: "Name", render: (r) => r.name, searchValue: (r) => r.name },
    { key: "short_name", header: "Short name", render: (r) => r.short_name ?? "—" },
    { key: "location", header: "Location", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "—" },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Archived"}</Badge>,
    },
  ];

  return (
    <div className="container" style={{ paddingBlock: "var(--space-8)" }}>
      <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
        <h1 style={{ fontSize: "var(--text-2xl)" }}>Institutions</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} /> New institution
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={institutions}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        searchPlaceholder="Search institutions..."
        emptyTitle="No institutions yet."
        emptyDescription="Create the first institution to start building out the academic structure."
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

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New institution" : "Edit institution"}>
        <form
          className="stack"
          style={{ gap: "var(--space-4)" }}
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <Input label="Name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Short name" value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} />
          <Input label="Country" value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
          <Input label="City" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <Button type="submit" isLoading={isSaving}>
            Save
          </Button>
        </form>
      </Modal>
    </div>
  );
}
