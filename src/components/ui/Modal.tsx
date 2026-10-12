import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const dialogRef = useRef < HTMLDivElement > (null);
  const previouslyFocused = useRef < HTMLElement | null > (null);
  const onCloseRef = useRef(onClose);
  
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  
  useEffect(() => {
    if (!isOpen) return;
    
    previouslyFocused.current = document.activeElement as HTMLElement;
    dialogRef.current?.focus();
    
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    }
    
    document.addEventListener("keydown", handleKeyDown);
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      
      const previousElement = previouslyFocused.current;
      if (previousElement && document.contains(previousElement)) {
        previousElement.focus();
      }
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-modal)" as unknown as number,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
        background: "rgba(2, 4, 10, 0.65)",
        backdropFilter: "var(--glass-blur)",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="glass-surface"
        style={{
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "var(--space-6)",
          background: "var(--bg-surface)",
        }}
      >
        <div
          className="cluster"
          style={{
            justifyContent: "space-between",
            marginBottom: "var(--space-4)",
          }}
        >
          <h2 id="modal-title" style={{ fontSize: "var(--text-xl)" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close dialog"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}