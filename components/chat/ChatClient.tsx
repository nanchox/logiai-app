"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { btnPrimary, ErrorText, input } from "@/components/manual/ui";

type Source = { n: number; title: string; href: string };
type Message = { role: "user" | "assistant"; content: string; sources?: Source[] };

const SUGGESTIONS = ["¿Qué hago cuando se llena el auditorio?", "¿Cuándo me toca servir y en qué posición?", "¿Qué novedades hay para mi sede?"];

export function ChatClient({ configured, limit }: { configured: boolean; limit: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setText("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; sources?: Source[]; remaining?: number; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "El asistente no pudo responder.");
      setMessages((m) => [...m, { role: "assistant", content: data.answer!, sources: data.sources }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!configured) return <p className="rounded-2xl border border-line bg-surface p-5 text-muted">El asistente todavía no está configurado. El administrador debe agregar la clave de OpenRouter en Vercel.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-48 space-y-3" aria-live="polite" aria-label="Conversación">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-muted">Pregúntame por el manual, los flujos, las novedades o tu servicio.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="rounded-full border border-line bg-surface px-3 py-1.5 text-sm hover:border-primary" onClick={() => ask(s)}>{s}</button>)}
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
                  {m.sources.map((s) => <li key={s.n}>[{s.n}] <Link href={s.href}>{s.title}</Link></li>)}
                </ol>
              </details>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-muted" role="status">Pensando…</p>}
        <div ref={end} />
      </div>
      <ErrorText error={error} />
      <form className="flex gap-2" aria-label="Preguntar al asistente" onSubmit={(e) => { e.preventDefault(); ask(text); }}>
        <input aria-label="Tu pregunta" className={input} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu pregunta…" autoComplete="off" />
        <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>Enviar</button>
      </form>
      <p className="text-xs text-muted">
        {remaining !== null ? `Te quedan ${remaining} de ${limit} preguntas hoy. ` : `Hasta ${limit} preguntas por día. `}
        Respondo solo con lo cargado en la aplicación; puedo equivocarme, confirma lo importante con tu coordinador.
      </p>
    </div>
  );
}
