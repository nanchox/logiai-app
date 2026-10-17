import Link from "next/link";

type Tab = "integrantes" | "grupos" | "lideres";

/** Pestañas de la sección Personas; cada una solo se ofrece a quien puede usarla. */
export function PeopleNav({ current, canManageGroups, canManageLeaders }: { current: Tab; canManageGroups: boolean; canManageLeaders: boolean }) {
  const tabs: { id: Tab; href: string; label: string; show: boolean }[] = [
    { id: "integrantes", href: "/personas", label: "Integrantes", show: true },
    { id: "grupos", href: "/personas/grupos", label: "Grupos y horarios", show: canManageGroups },
    { id: "lideres", href: "/personas/lideres", label: "Líderes y administración", show: canManageLeaders },
  ];
  const visible = tabs.filter((t) => t.show);
  if (visible.length < 2) return null; // con una sola sección no hace falta menú
  return (
    <nav aria-label="Personas" className="mb-5 flex gap-2 overflow-x-auto border-b border-line pb-3">
      {visible.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === current ? "page" : undefined}
          className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold no-underline ${t.id === current ? "border-accent bg-accent !text-on-accent" : "border-line bg-surface hover:border-primary"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
