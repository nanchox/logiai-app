/** Marca de servicio activo: el de hoy o el siguiente que le toca a la persona. */
export function ActiveBadge({ today }: { today: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-on-accent">
      <span aria-hidden>●</span> Activo · {today ? "Hoy" : "Siguiente"}
    </span>
  );
}
