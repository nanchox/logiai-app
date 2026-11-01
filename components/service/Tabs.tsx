import Link from "next/link";

export type TabItem = { id: string; label: string; badge?: number };

/** Pestañas por dirección (?tab=): se pueden compartir y el botón «atrás» funciona. La primera es la predeterminada. */
export function Tabs({ tabs, current, base, label = "Secciones" }: { tabs: TabItem[]; current: string; base: string; label?: string }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t, i) => {
        const active = t.id === current;
        return (
          <Link
            key={t.id}
            href={i === 0 ? base : `${base}?tab=${t.id}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-4 px-4 py-2.5 text-sm font-bold no-underline ${active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t.label}
            {!!t.badge && <span aria-label={`${t.badge} pendientes`} className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-extrabold text-on-accent">{t.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pestaña pedida si existe; si no, la primera. */
export const pickTab = (tabs: TabItem[], wanted: unknown): string => (typeof wanted === "string" && tabs.some((t) => t.id === wanted) ? wanted : tabs[0].id);
