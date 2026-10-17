"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, CATEGORY_PLURAL, canManageAnnouncement, type AnnouncementItem, type Category } from "@/lib/announcements/types";
import type { GroupItem, SiteItem, Viewer } from "@/lib/people/types";
import { btn, btnPrimary } from "@/components/manual/ui";
import { AnnouncementCard } from "./AnnouncementCard";
import { AnnouncementDialog } from "./AnnouncementDialog";

type Props = { items: AnnouncementItem[]; viewer: Viewer | null; sites: SiteItem[]; groups: GroupItem[] };

export function AnnouncementsClient({ items, viewer, sites, groups }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Category | "all">("all");
  const [editing, setEditing] = useState<AnnouncementItem | "new" | null>(null);

  const count = (c: Category) => items.filter((i) => i.category === c).length;
  const shown = filter === "all" ? items : items.filter((i) => i.category === filter);
  const canCreate = !!viewer && (viewer.kind !== "coordinator" || groups.length > 0);

  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-primary"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrar por tipo" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          <button type="button" className={chip(filter === "all")} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todos ({items.length})</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={chip(filter === c)} aria-pressed={filter === c} onClick={() => setFilter(c)}>{CATEGORY_PLURAL[c]} ({count(c)})</button>
          ))}
        </div>
        {canCreate && <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>＋ Nuevo anuncio</button>}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">
          {items.length === 0 ? "No hay anuncios por ahora." : "No hay anuncios de este tipo."}
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map((a) => (
            <li key={a.id}>
              <AnnouncementCard
                a={a}
                actions={canManageAnnouncement(viewer, a) && (
                  <button type="button" className={btn} onClick={() => setEditing(a)} aria-label={`Editar ${a.title}`}>Editar</button>
                )}
              />
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <AnnouncementDialog
          open={editing !== null}
          item={editing === "new" ? null : editing}
          viewer={viewer}
          sites={sites}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
