import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Master Spec section 81 — Admin destructive/important actions
 * (archive, suspend, cancel a live competition, ...) go through this
 * rather than firing immediately on click. */
export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  isDangerous,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-6)" }}>{description}</p>
      <div className="cluster" style={{ justifyContent: "flex-end", gap: "var(--space-3)" }}>
        <Button variant="ghost" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant={isDangerous ? "danger" : "primary"} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
