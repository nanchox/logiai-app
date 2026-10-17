// Las sedes están en Colombia (UTC-5, sin horario de verano): las fechas se muestran y se capturan en esa hora para que
// el servidor, el navegador y quien las escribe vean siempre lo mismo.
export const TZ = "America/Bogota";
const OFFSET = "-05:00";

const dateTime = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short", timeZone: TZ });
const dateOnly = new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: TZ });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** Instante (ISO) → valor de <input type="datetime-local"> en hora de Colombia: «2026-10-20T08:30». */
export function toInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Valor de <input type="datetime-local"> (hora de Colombia) → instante ISO; vacío o inválido → null. */
export function fromInputValue(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const d = new Date(`${local}:00${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
