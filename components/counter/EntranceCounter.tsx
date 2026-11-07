"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addTap, canDecrement, canIncrement, displayCount, flush, level, prepareSend, type PendingOp } from "@/lib/counter/queue";
import type { CounterMeeting, CounterState, DeltaResult } from "@/lib/counter/types";
import { formatMeetingTime, nearestMeeting } from "@/lib/service/meetings";
import { createClient } from "@/lib/supabase/client";

const storeKey = (eventId: string, entranceId: string, meetingId: string) => `logiai-counter:${eventId}:${entranceId}:${meetingId}`;
const readPending = (key: string): PendingOp[] => { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as PendingOp[]; } catch { return []; } };
const writePending = (key: string, ops: PendingOp[]) => { try { if (ops.length) localStorage.setItem(key, JSON.stringify(ops)); else localStorage.removeItem(key); } catch { /* sin almacenamiento: sigue en memoria */ } };
const nowBogota = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const newId = () => crypto.randomUUID();
const isNetworkError = (e: { code?: string; message: string }) => !e.code || /fetch|network|load failed|timeout/i.test(e.message);

const LEVEL_STYLE = { ok: "text-fg", cerca: "text-accent", tope: "text-danger" } as const;
const BAR_STYLE = { ok: "bg-primary", cerca: "bg-accent", tope: "bg-danger" } as const;

/** Contador digital de una entrada en pantalla completa: un botón grande suma, otro resta, y el cupo es el tope. Sigue contando sin señal. */
export function EntranceCounter({ eventId, entranceId, initial, backHref }: { eventId: string; entranceId: string; initial: CounterState; backHref: string }) {
  const sb = useMemo(() => createClient(), []);
  const [server, setServer] = useState<Record<string, CounterMeeting>>(() => Object.fromEntries(initial.meetings.map((m) => [m.meetingId, m])));
  const meetings = initial.meetings;
  const [meetingId, setMeetingId] = useState<string>(() => (nearestMeeting(meetings.filter((m) => m.time).map((m) => ({ ...m, time: m.time as string })), nowBogota())?.meetingId ?? meetings[0].meetingId));
  const [pending, setPending] = useState<Record<string, PendingOp[]>>({});
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, PendingOp[]>>({});

  // Toda la cola pasa por aquí: se actualiza al instante (memoria y teléfono) a partir de lo último, aunque haya un envío en curso.
  const commit = useCallback((mid: string, fn: (ops: PendingOp[]) => PendingOp[]) => {
    const next = fn(pendingRef.current[mid] ?? []);
    pendingRef.current = { ...pendingRef.current, [mid]: next };
    writePending(storeKey(eventId, entranceId, mid), next);
    setPending(pendingRef.current);
  }, [eventId, entranceId]);

  // Lo que quedó pendiente en este teléfono (por ejemplo, si se cerró sin señal)
  useEffect(() => {
    const restored: Record<string, PendingOp[]> = {};
    for (const m of meetings) { const p = readPending(storeKey(eventId, entranceId, m.meetingId)); if (p.length) restored[m.meetingId] = p; }
    if (Object.keys(restored).length) Promise.resolve().then(() => { pendingRef.current = { ...restored, ...pendingRef.current }; setPending(pendingRef.current); });
  }, [eventId, entranceId, meetings]);

  const send = useCallback(async () => {
    if (sending.current || !navigator.onLine) return;
    sending.current = true;
    try {
      for (const m of meetings) {
        const current = pendingRef.current[m.meetingId] ?? [];
        if (!current.length) continue;
        // Los toques nuevos se juntan y se marcan como intentados antes de enviar; los toques que lleguen durante el envío quedan aparte.
        const queue = prepareSend(current);
        commit(m.meetingId, (ops) => [...queue, ...ops.filter((o) => !current.some((c) => c.id === o.id))]);
        const r = await flush(queue, async (op) => {
          const { data, error } = await sb.rpc("apply_entrance_delta", { p_event: eventId, p_entrance: entranceId, p_meeting: m.meetingId, p_delta: op.delta, p_op: op.id });
          if (error) {
            const network = isNetworkError(error);
            if (!network) commit(m.meetingId, (ops) => ops.filter((o) => o.id !== op.id));
            return { ok: false as const, network, message: error.message };
          }
          const res = data as DeltaResult;
          if (res.capped === "cupo") setNotice("Se llegó al cupo de esta entrada.");
          else if (res.capped === "aforo") setNotice("Se llegó al aforo del lugar: no caben más personas.");
          else if (res.capped === "cero") setNotice("El conteo no puede bajar de cero.");
          commit(m.meetingId, (ops) => ops.filter((o) => o.id !== op.id));
          setServer((s) => ({ ...s, [m.meetingId]: { ...s[m.meetingId], count: res.count, locationTotal: res.locationTotal ?? s[m.meetingId].locationTotal } }));
          return { ok: true as const, count: res.count };
        });
        if (r.rejected) setNotice(r.rejected);
        setOnline(r.remaining.length === 0);
      }
    } finally { sending.current = false; }
  }, [sb, eventId, entranceId, meetings, commit]);

  const schedule = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { void send(); }, 500); }, [send]);

  // Conexión: al volver la señal se envía lo pendiente; mientras hay conexión se consulta lo que cuentan los demás en la misma entrada.
  useEffect(() => {
    const on = () => { setOnline(true); void send(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const t = setInterval(async () => {
      if (!navigator.onLine) return;
      if (Object.values(pendingRef.current).some((o) => o.length)) { void send(); return; }
      const { data, error } = await sb.rpc("entrance_counter_state", { p_event: eventId, p_entrance: entranceId });
      if (error || !Array.isArray(data)) return;
      setOnline(true);
      setServer((s) => { const n = { ...s }; for (const r of data as Record<string, unknown>[]) { const k = r.meeting_id as string; if (n[k]) n[k] = { ...n[k], count: Number(r.count ?? 0), locationTotal: Number(r.location_total ?? 0), quota: (r.quota as number | null) ?? null }; } return n; });
    }, 5000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(t); };
  }, [sb, eventId, entranceId, send]);

  // Pantalla encendida mientras se cuenta
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const ask = async () => { try { lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null; } catch { /* no disponible */ } };
    void ask();
    const vis = () => { if (document.visibilityState === "visible") void ask(); };
    document.addEventListener("visibilitychange", vis);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    return () => { document.removeEventListener("visibilitychange", vis); document.removeEventListener("fullscreenchange", fs); void lock?.release(); };
  }, []);

  const cur = server[meetingId];
  const ops = pending[meetingId] ?? [];
  const shown = displayCount(cur.count, ops, cur.quota);
  const lvl = level(shown, cur.quota);
  const pendingTotal = Object.values(pending).reduce((s, o) => s + o.length, 0);

  const tap = (delta: 1 | -1) => {
    if (delta === 1 && !canIncrement(shown, cur.quota)) { setNotice("Se llegó al cupo de esta entrada."); navigator.vibrate?.([30, 40, 30]); return; }
    if (delta === -1 && !canDecrement(shown)) return;
    setNotice(null);
    navigator.vibrate?.(12);
    commit(meetingId, (list) => addTap(list, delta, newId));
    schedule();
  };

  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* no disponible (por ejemplo, iPhone) */ }
  };

  const title = (m: CounterMeeting) => (m.time ? `${formatMeetingTime(m.time)}${m.label ? ` · ${m.label}` : ""}` : "Todo el servicio");

  return (
    <div className="fixed inset-0 z-[100] flex select-none flex-col bg-bg text-fg" style={{ touchAction: "manipulation" }} role="region" aria-label={`Contador de ${initial.entranceName}`}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <Link href={backHref} className="rounded-lg border border-line px-3 py-2 text-sm font-bold no-underline">← Salir</Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-extrabold">{initial.entranceName}</p>
          <p className="truncate text-xs text-muted">{initial.locationName}{initial.note ? ` · ${initial.note}` : ""}{initial.zones ? ` · Zonas: ${initial.zones}` : ""}</p>
        </div>
        <span role="status" className={`rounded-full border px-2.5 py-1 text-xs font-bold ${online ? "border-primary/60 text-fg" : "border-danger/60 text-danger"}`}>
          {online ? (pendingTotal ? "Enviando…" : "En línea") : `Sin conexión${pendingTotal ? ` · ${pendingTotal} por enviar` : ""}`}
        </span>
        <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-line px-3 py-2 text-sm font-bold" aria-pressed={fullscreen}>{fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}</button>
      </header>

      {meetings.length > 1 && (
        <div role="group" aria-label="Reunión" className="flex gap-2 overflow-x-auto border-b border-line px-3 py-2">
          {meetings.map((m) => (
            <button key={m.meetingId} type="button" aria-pressed={m.meetingId === meetingId} onClick={() => { setMeetingId(m.meetingId); setNotice(null); }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${m.meetingId === meetingId ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>{title(m)}</button>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center justify-center gap-2 px-4 pb-2 pt-4 text-center">
        <p className="text-sm font-semibold text-muted">{title(cur)}</p>
        <p role="status" aria-live="polite" aria-label={`Conteo ${shown}`} className={`font-black leading-none tabular-nums ${LEVEL_STYLE[lvl]}`} style={{ fontSize: "clamp(5rem, 24vw, 11rem)" }}>{shown}</p>
        {cur.quota !== null ? (
          <div className="w-full max-w-md">
            <p className="text-lg font-bold">de {cur.quota} <span className="text-sm font-normal text-muted">· quedan {Math.max(0, cur.quota - shown)}</span></p>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={cur.quota} aria-valuenow={Math.min(shown, cur.quota)} aria-label="Avance del cupo">
              <div className={`h-full ${BAR_STYLE[lvl]}`} style={{ width: `${Math.min(100, (shown / Math.max(1, cur.quota)) * 100)}%` }} />
            </div>
          </div>
        ) : <p className="text-sm text-muted">Esta reunión no tiene cupo para esta entrada: cuenta sin tope.</p>}
        {lvl === "tope" && <p className="font-bold text-danger">Cupo completo: no entra nadie más por aquí.</p>}
        {lvl === "cerca" && <p className="font-bold text-accent">Cerca del cupo</p>}
        <p className="h-5 text-sm" role="alert">{notice}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3">
        <button type="button" onClick={() => tap(1)} disabled={!canIncrement(shown, cur.quota)} aria-label="Sumar una persona"
          className="min-h-40 flex-1 rounded-3xl bg-primary text-6xl font-black text-on-primary shadow active:scale-[0.99] disabled:opacity-40">＋1</button>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => tap(-1)} disabled={!canDecrement(shown)} aria-label="Restar una persona"
            className="h-16 w-40 rounded-2xl border-2 border-line bg-surface text-3xl font-black disabled:opacity-40">−1</button>
          <p className="min-w-0 flex-1 text-right text-sm text-muted">
            Lugar: <strong className="text-fg">{cur.locationTotal + Math.max(0, shown - cur.count)}</strong>{initial.capacity !== null ? ` de ${initial.capacity}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
