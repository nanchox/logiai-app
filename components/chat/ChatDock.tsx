"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { input } from "@/components/manual/ui";
import { ChatFooterNote, ChatMessages } from "./ChatView";
import { useChat } from "./ChatProvider";

/** Botón del menú superior: abre o cierra el asistente. */
export function ChatToggle({ className }: { className: string }) {
  const { open, setOpen, configured } = useChat();
  const pathname = usePathname();
  if (pathname.startsWith("/asistente")) return <span className={`${className} cursor-default underline decoration-accent decoration-2 underline-offset-8`} aria-current="page">Asistente</span>;
  return (
    <button type="button" className={className} aria-expanded={configured ? open : undefined} aria-controls="asistente-dock" onClick={() => setOpen(!open)}>Asistente</button>
  );
}

/** Aparta el espacio del panel lateral en pantallas grandes (el contenido se corre, no se tapa) y de la barra inferior en el celular. */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const { open, configured } = useChat();
  const pathname = usePathname();
  const docked = configured && !pathname.startsWith("/asistente");
  return <div className={docked ? `pb-20 lg:pb-0 ${open ? "lg:pr-[24rem]" : ""}` : ""}>{children}</div>;
}

const QuestionForm = forwardRef<HTMLInputElement, { onFocus?: () => void }>(function QuestionForm({ onFocus }, ref) {
  const { ask, busy } = useChat();
  const [text, setText] = useState("");
  return (
    <form className="flex gap-2" aria-label="Preguntar al asistente" onSubmit={(e) => { e.preventDefault(); const q = text; setText(""); void ask(q); }}>
      <input ref={ref} aria-label="Tu pregunta" className={input} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} onFocus={onFocus}
        placeholder="Pregunta al asistente…" autoComplete="off" enterKeyHint="send" />
      <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-on-primary hover:brightness-110 disabled:opacity-50" disabled={busy || !text.trim()}>Enviar</button>
    </form>
  );
});

/**
 * Asistente flotante. En el celular es una barra inferior con el cuadro de preguntas siempre activo que, al escribir, se despliega en una hoja
 * con la conversación. En pantallas grandes es un panel lateral que se expande y se colapsa. La conversación se queda en el mismo lugar al navegar.
 */
export function ChatDock() {
  const { open, setOpen, configured } = useChat();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);

  // Con Escape se minimiza.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);
  // Al abrir desde el menú o el botón, el cursor queda en el cuadro de preguntas.
  useEffect(() => { if (open) inputRef.current?.focus({ preventScroll: true }); }, [open]);

  if (!configured || pathname.startsWith("/asistente")) return null;
  const minimizeOnPhone = () => { if (window.matchMedia("(max-width: 1023px)").matches) setOpen(false); };

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-hidden onClick={() => setOpen(false)} />}

      {!open && (
        <button type="button" className="fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-extrabold text-on-accent shadow-lg hover:brightness-105 lg:flex"
          aria-expanded={false} aria-controls="asistente-dock" onClick={() => setOpen(true)}>
          <span aria-hidden>✦</span> Asistente
        </button>
      )}

      <aside id="asistente-dock" aria-label="Asistente"
        className={open
          ? "fixed inset-x-0 bottom-0 z-40 flex h-[78dvh] flex-col rounded-t-2xl border-t border-line bg-bg shadow-2xl lg:inset-x-auto lg:right-0 lg:top-[60px] lg:h-auto lg:w-96 lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none"
          : "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"}>
        {open && (
          <>
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <p className="flex-1 font-extrabold"><span aria-hidden className="mr-1.5 text-accent">✦</span>Asistente</p>
              <Link href="/asistente" className="rounded-lg px-2 py-1 text-sm font-semibold" onClick={() => setOpen(false)}>Pantalla completa</Link>
              <button type="button" className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:border-primary" aria-label="Minimizar el asistente" onClick={() => setOpen(false)}>
                <span className="lg:hidden" aria-hidden>⌄</span><span className="hidden lg:inline" aria-hidden>→</span><span className="sr-only">Minimizar</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3"><ChatMessages onNavigate={minimizeOnPhone} /></div>
          </>
        )}
        <div className={open ? "space-y-1.5 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" : ""}>
          <QuestionForm ref={inputRef} onFocus={() => setOpen(true)} />
          {open && <ChatFooterNote />}
        </div>
      </aside>
    </>
  );
}
