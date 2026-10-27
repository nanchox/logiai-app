"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type ChatSource = { n: number; title: string; href: string };
export type ChatMessage = { role: "user" | "assistant"; content: string; sources?: ChatSource[] };

type ChatState = {
  configured: boolean; limit: number; open: boolean; setOpen: (v: boolean) => void;
  messages: ChatMessage[]; busy: boolean; error: string | null; remaining: number | null;
  ask: (question: string) => Promise<void>;
};
const Ctx = createContext<ChatState | null>(null);

export function useChat(): ChatState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChat debe usarse dentro de ChatProvider");
  return c;
}

/**
 * La conversación vive en el diseño de la aplicación: se conserva al navegar entre pantallas (el panel lateral y la pantalla completa
 * comparten la misma). No se guarda en el navegador ni en el servidor: al recargar, empieza de nuevo.
 */
export function ChatProvider({ configured, limit, children }: { configured: boolean; limit: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; sources?: ChatSource[]; remaining?: number; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "El asistente no pudo responder.");
      setMessages((m) => [...m, { role: "assistant", content: data.answer!, sources: data.sources }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, messages]);

  const value = useMemo(() => ({ configured, limit, open, setOpen, messages, busy, error, remaining, ask }), [configured, limit, open, messages, busy, error, remaining, ask]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
