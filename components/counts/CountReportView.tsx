import Link from "next/link";
import type { SiteReport } from "@/lib/counts/report";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import { formatServiceDate } from "@/lib/service/dates";

const fmt = (n: number) => n.toLocaleString("es-CO");
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);

export function Delta({ now, before }: { now: number; before: number | null }) {
  if (before === null || (before === 0 && now === 0)) return <span className="text-muted">Sin datos de la semana anterior</span>;
  const d = now - before;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return <span className="text-muted">{sign}{fmt(Math.abs(d))} frente a la semana anterior ({fmt(before)})</span>;
}

/** Reporte de la semana de una sede: totales por servicio, por día y de la semana. Solo se ve en pantalla. */
export function SiteReportView({ report, prevTotal }: { report: SiteReport; prevTotal: number | null }) {
  return (
    <section aria-label={`Conteos de ${report.siteName}`} className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-xl font-extrabold">{report.siteName}</h2>
        <p className="mt-1 text-3xl font-extrabold" aria-label={`Total de la semana en ${report.siteName}`}>{fmt(report.total)} <span className="text-base font-semibold text-muted">personas en la semana</span></p>
        <p className="text-sm"><Delta now={report.total} before={prevTotal} /></p>
        <p className="mt-1 text-sm text-muted">
          Ocupación de lo contado: <strong className="text-fg">{pct(report.occupancy)}</strong> · {report.counted} de {report.services} servicios con conteo
          {report.pending > 0 && <> · <strong className="text-danger">{report.pending} sin registrar</strong></>}
        </p>
      </div>

      {report.days.length === 0 && <p className="rounded-2xl border border-line bg-surface p-5 text-muted">No hay servicios programados esta semana.</p>}

      {report.days.map((d) => (
        <article key={d.date} aria-label={formatServiceDate(d.date)} className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="text-lg font-extrabold">{formatServiceDate(d.date)}</h3>
            <span className="text-sm text-muted">Total del día: <strong className="text-fg">{fmt(d.total)}</strong> · ocupación {pct(d.occupancy)}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {d.services.map((s) => (
              <div key={s.event.id} className="rounded-2xl border border-line bg-surface p-4" aria-label={`Servicio ${DAY_LABEL[s.event.day]} ${SHIFT_LABEL[s.event.shift] ?? ""}`.trim()}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{[DAY_LABEL[s.event.day], SHIFT_LABEL[s.event.shift]].filter(Boolean).join(" ")} · {s.event.groupName ?? "Sin grupo"}</p>
                  {s.event.status === "cancelado" && <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-bold text-white">Cancelado</span>}
                  {s.pending && <span className="rounded-full border border-danger px-2 py-0.5 text-xs font-bold text-danger">Sin registrar</span>}
                  <Link href={`/servicio/${s.event.id}`} className="ml-auto text-sm font-semibold">Abrir</Link>
                </div>
                {s.event.status === "cancelado" ? null : (
                  <table className="mt-2 w-full text-sm">
                    <thead><tr className="text-left text-muted"><th className="py-1 font-semibold">Ubicación</th><th className="py-1 text-right font-semibold">Contados</th><th className="py-1 text-right font-semibold">Capacidad</th><th className="py-1 text-right font-semibold">%</th></tr></thead>
                    <tbody>
                      {s.items.filter((i) => i.capacity !== null || i.total !== null).map((i) => (
                        <tr key={i.locationId} className="border-t border-line">
                          <td className="py-1">{i.name}</td>
                          <td className="py-1 text-right font-semibold">{i.total === null ? <span className="font-normal text-muted">—</span> : fmt(i.total)}</td>
                          <td className="py-1 text-right text-muted">{i.capacity === null ? "—" : fmt(i.capacity)}</td>
                          <td className="py-1 text-right text-muted">{i.total !== null && i.capacity ? pct(Math.round((i.total / i.capacity) * 1000) / 10) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t border-line font-bold"><td className="py-1">Total</td><td className="py-1 text-right">{fmt(s.total)}</td><td className="py-1 text-right text-muted">{s.hasCounts ? fmt(s.capacity) : "—"}</td><td className="py-1 text-right text-muted">{s.hasCounts ? pct(s.occupancy) : ""}</td></tr></tfoot>
                  </table>
                )}
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
