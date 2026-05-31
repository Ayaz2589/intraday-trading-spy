import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ConfirmDialog — in-app replacement for window.confirm(). Renders into
// document.body via portal so it sits above the topbar + sidebar regardless
// of the trigger's stacking context. Esc + backdrop click both cancel;
// initial focus lands on Cancel so the safer action is the default.
type Variant = "destructive" | "neutral";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "neutral",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    cancelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === "destructive" ? "btn btn-danger" : "btn btn-primary";

  return createPortal(
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="dialog"
      >
        <header className="dialog-head">
          <h3 id="confirm-dialog-title" className="dialog-title">
            {title}
          </h3>
        </header>
        <div className="dialog-body">{message}</div>
        <footer className="dialog-foot">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
