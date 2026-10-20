// Las fechas de servicio son fechas de calendario («2030-01-06»), sin hora ni zona: se manejan como texto
// y solo se convierten para mostrarlas, fijando el mediodía UTC para que ninguna zona horaria cambie el día.
import { TZ } from "@/lib/announcements/dates";

const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const long = new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const at = (d: string) => new Date(`${d}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Hoy en Colombia: «2026-10-18». */
export const todayCo = (now = new Date()) => today.format(now);
export const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(at(d).getTime()) && at(d).toISOString().startsWith(d);
export const formatServiceDate = (d: string) => cap(long.format(at(d)));
export const formatServiceDateShort = (d: string) => cap(short.format(at(d)).replace(/\./g, ""));
export function addDays(d: string, n: number): string {
  const x = at(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Lunes de la semana de una fecha (las semanas del reporte van de lunes a domingo). */
export function mondayOf(d: string): string {
  const dow = at(d).getUTCDay();   // 0 = domingo
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}
