// Reuniones de un horario o de un servicio (por ejemplo el sábado a la 1, 3, 5 y 7 pm). Funciones puras: sin base de datos.
export type Meeting = { id: string; baseId: string | null; time: string; label: string | null };   // time = «HH:MM» (24 horas)

export const MAX_MEETINGS = 8;

/** «13:00» → «1:00 pm»; «00:30» → «12:30 am». */
export function formatMeetingTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** «1:00 pm» o «1:00 pm · Primera reunión». */
export const meetingTitle = (m: Pick<Meeting, "time" | "label">) => (m.label ? `${formatMeetingTime(m.time)} · ${m.label}` : formatMeetingTime(m.time));

export const sortMeetings = <T extends Pick<Meeting, "time">>(list: T[]): T[] => [...list].sort((a, b) => a.time.localeCompare(b.time));

/** La reunión que se está celebrando o la más cercana a una hora (para sugerirla al abrir el contador). */
export function nearestMeeting<T extends Pick<Meeting, "time">>(list: T[], nowHHMM: string): T | null {
  if (!list.length) return null;
  const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const now = mins(nowHHMM);
  // La última que ya empezó hasta 2 horas antes; si no hay, la próxima; si todas pasaron, la última.
  const sorted = sortMeetings(list);
  const started = sorted.filter((m) => mins(m.time) <= now);
  const last = started.at(-1);
  if (last && now - mins(last.time) <= 120) return last;
  return sorted.find((m) => mins(m.time) > now) ?? last ?? sorted[0];
}
