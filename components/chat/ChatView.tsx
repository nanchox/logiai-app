"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ErrorText } from "@/components/manual/ui";
import { useChat } from "./ChatProvider";

const SUGGESTIONS = ["¿Qué puedo hacer aquí?", "¿Cuándo me toca servir y en qué posición?", "¿Qué hago cuando se llena el auditorio?", "¿Qué novedades hay para mi sede?"];

/** Conversación (mensajes, sugerencias, fuentes y errores). La usan el panel y la pantalla completa. */
export function ChatMessages({ onNavigate }: { onNavigate?: () => void }) {
  const { messages, busy, error, ask, configured } = useChat();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  if (!configured) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">El asistente todavía no está configurado. El administrador debe agregar la clave de OpenRouter en Vercel.</p>;
  return (
    <div className="space-y-3" aria-live="polite" aria-label="Conversación">
      {messages.length === 0 && (
        <div className="space-y-2">
          <p className="text-muted">¡Hola! Soy el Asistente de LogiAI. Pregúntame por el manual, los flujos, las novedades o tu servicio, o cómo usar la aplicación.</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-sm hover:border-primary" onClick={() => ask(s)}>{s}</button>)}
          </div>
        </div>
      )}
      {messages.map((m, i) => (
        <div key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 ${m.role === "user" ? "ml-auto bg-primary text-on-primary" : "border border-line bg-surface"}`}>
          <p className="whitespace-pre-line break-words">{m.content}</p>
          {m.sources && m.sources.length > 0 && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-link">Fuentes consultadas ({m.sources.length})</summary>
              <ol className="mt-1 space-y-0.5">
                {m.sources.map((s) => <li key={s.n}>[{s.n}] <Link href={s.href} onClick={onNavigate}>{s.title}</Link></li>)}
              </ol>
            </details>
          )}
        </div>
      ))}
      {busy && <p className="text-sm text-muted" role="status">Pensando…</p>}
      <ErrorText error={error} />
      <div ref={end} />
    </div>
  );
}

export function ChatFooterNote() {
  const { remaining, limit } = useChat();
  return (
    <p className="text-xs text-muted">
      {remaining !== null ? `Te quedan ${remaining} de ${limit} preguntas hoy. ` : `Hasta ${limit} preguntas por día. `}
      Respondo solo con lo cargado en la aplicación; puedo equivocarme, confirma lo importante con tu coordinador.
    </p>
  );
}
