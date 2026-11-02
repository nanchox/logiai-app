"use client";

import { useState } from "react";
import { btn, btnPrimary, input, label } from "@/components/manual/ui";
import { MAX_MEETINGS, formatMeetingTime, type Meeting } from "@/lib/service/meetings";

/** Lista de reuniones (1, 3, 5 y 7 pm…) con alta, cambio de hora o nombre y baja. Sirve para un horario y para un servicio. */
export function MeetingsEditor({
  title, meetings, busy, onAdd, onUpdate, onRemove,
}: {
  title: string; meetings: Meeting[]; busy: boolean;
  onAdd: (time: string, label: string) => void; onUpdate: (id: string, time: string, label: string) => void; onRemove: (id: string) => void;
}) {
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ time: "", label: "" });
  const full = meetings.length >= MAX_MEETINGS;

  return (
    <div className="space-y-3" role="group" aria-label={title}>
      {meetings.length === 0 ? <p className="text-sm text-muted">Sin reuniones todavía: todo el servicio cuenta como una sola.</p> : (
        <ul className="flex flex-wrap gap-2">
          {meetings.map((m) => (
            <li key={m.id} aria-label={`Reunión ${formatMeetingTime(m.time)}`}>
              {editing === m.id ? (
                <form className="flex flex-wrap items-end gap-2 rounded-xl border border-primary bg-bg p-2" aria-label={`Editar la reunión de ${formatMeetingTime(m.time)}`}
                  onSubmit={(e) => { e.preventDefault(); onUpdate(m.id, draft.time, draft.label); setEditing(null); }}>
                  <input type="time" className={`${input} w-32`} aria-label="Hora" required value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                  <input className={`${input} w-40`} aria-label="Nombre (opcional)" maxLength={40} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Nombre (opcional)" />
                  <button className={btnPrimary} disabled={busy}>Guardar</button>
                  <button type="button" className={btn} onClick={() => setEditing(null)}>Cancelar</button>
                </form>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-badge px-3 py-1 text-sm font-bold text-on-badge">
                  <button type="button" className="font-bold" disabled={busy} aria-label={`Cambiar la reunión de ${formatMeetingTime(m.time)}`} onClick={() => { setDraft({ time: m.time, label: m.label ?? "" }); setEditing(m.id); }}>
                    {formatMeetingTime(m.time)}{m.label ? ` · ${m.label}` : ""}
                  </button>
                  <button type="button" aria-label={`Quitar la reunión de ${formatMeetingTime(m.time)}`} className="ml-1 font-black" disabled={busy} onClick={() => onRemove(m.id)}>✕</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap items-end gap-2" aria-label={`Agregar reunión · ${title}`} onSubmit={(e) => { e.preventDefault(); onAdd(time, name); setTime(""); setName(""); }}>
        <div>
          <label className={label}>Hora de la reunión
            <input type="time" className={`${input} mt-1 w-32`} required value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <div>
          <label className={label}>Nombre (opcional)
            <input className={`${input} mt-1 w-44`} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Jóvenes" />
          </label>
        </div>
        <button className={btn} disabled={busy || !time || full}>＋ Agregar reunión</button>
        {full && <span className="text-sm text-muted">Máximo {MAX_MEETINGS} reuniones.</span>}
      </form>
    </div>
  );
}

