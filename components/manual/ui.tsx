"use client";

import { useEffect, useRef } from "react";

export const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted";
export const btn = "rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold hover:border-primary disabled:opacity-50";
export const btnPrimary = "rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary hover:brightness-110 disabled:opacity-50";
export const btnDanger = "rounded-lg border border-danger/60 px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50";
export const label = "mb-1 block text-xs font-bold uppercase tracking-wider text-muted";

/** Diálogo nativo (<dialog>): foco atrapado, Esc para cerrar y clic fuera. */
export function ModalDialog({
  open, onClose, children, size = "sm", title,
}: { open: boolean; onClose: () => void; children: React.ReactNode; size?: "sm" | "lg" | "xl"; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" data-size={size} aria-label={title} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && children}
    </dialog>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="rounded-lg border border-danger/60 bg-danger/10 p-2 text-sm">{error}</p> : null;
}
