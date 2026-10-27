"use client";

import { useRef, useState } from "react";
import { btnPrimary, input } from "@/components/manual/ui";
import { ChatFooterNote, ChatMessages } from "./ChatView";
import { useChat } from "./ChatProvider";

/** Pantalla completa del asistente: la misma conversación que el panel. */
export function ChatPage() {
  const { ask, busy, configured } = useChat();
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="min-h-48"><ChatMessages /></div>
      {configured && (
        <>
          <form className="flex gap-2" aria-label="Preguntar al asistente" onSubmit={(e) => { e.preventDefault(); const q = text; setText(""); void ask(q); ref.current?.focus(); }}>
            <input ref={ref} aria-label="Tu pregunta" className={input} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu pregunta…" autoComplete="off" />
            <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>Enviar</button>
          </form>
          <ChatFooterNote />
        </>
      )}
    </div>
  );
}
