"use client";

import { useMemo, useState } from "react";
import { fromInputValue, toInputValue } from "@/lib/announcements/dates";
import { deleteAnnouncement, MAX_LINKS, saveAnnouncement } from "@/lib/announcements/mutations";
import { CATEGORIES, CATEGORY_LABEL, scopeKindOf, type AnnouncementItem, type Category, type ScopeKind } from "@/lib/announcements/types";
import { DAY_LABEL } from "@/lib/labels";
import { groupLabel } from "@/lib/people/labels";
import type { GroupItem, SiteItem, Viewer } from "@/lib/people/types";
import { createClient } from "@/lib/supabase/client";
import { GroupSelect } from "@/components/people/GroupSelect";
import { btn, btnDanger, btnPrimary, ErrorText, input, label, ModalDialog } from "@/components/manual/ui";

type Props = { open: boolean; item: AnnouncementItem | null; viewer: Viewer; sites: SiteItem[]; groups: GroupItem[]; onClose: () => void; onSaved: () => void };

export function AnnouncementDialog(props: Props) {
  return (
    <ModalDialog open={props.open} onClose={props.onClose} size="lg" title={props.item ? "Editar novedad" : "Nueva novedad"}>
      {props.open && <Form key={props.item?.id ?? "new"} {...props} />}
    </ModalDialog>
  );
}

const KIND_LABEL: Record<ScopeKind, string> = {
  all: "Toda la iglesia",
  site: "Una sede",
  site_day: "Una sede, un día",
  day: "Un día, en todas las sedes",
  group: "Un grupo",
};

function kindsFor(v: Viewer): ScopeKind[] {
  if (v.kind === "admin" || v.kind === "head") return ["all", "site", "site_day", "day", "group"];
  if (v.kind === "leader") return ["site", "site_day", "group"];
  return ["group"];
}

function Form({ item, viewer, sites, groups, onClose, onSaved }: Props) {
  const sb = useMemo(() => createClient(), []);
  const kinds = kindsFor(viewer);
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [category, setCategory] = useState<Category>(item?.category ?? "anuncio");
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  const [kind, setKind] = useState<ScopeKind>(item ? scopeKindOf(item) : kinds[0]);
  const [siteId, setSiteId] = useState(item?.siteId ?? sites[0]?.id ?? "");
  const [day, setDay] = useState(item?.day ?? "sabado");
  const [groupId, setGroupId] = useState(item?.groupId ?? (viewer.groupId && groups.some((g) => g.id === viewer.groupId) ? viewer.groupId : (groups[0]?.id ?? "")));
  const [startsAt, setStartsAt] = useState(item ? toInputValue(item.startsAt) : "");
  const [endsAt, setEndsAt] = useState(toInputValue(item?.endsAt ?? null));
  const [links, setLinks] = useState((item?.links ?? []).map((l) => ({ ...l, tmp: l.id })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteName = sites.find((s) => s.id === siteId)?.name ?? "la sede";
  const group = groups.find((g) => g.id === groupId);
  const audience: Record<ScopeKind, string> = {
    all: "Lo verá toda la iglesia: cualquier persona con cuenta.",
    site: `Lo verán quienes sirven en ${siteName} y su líder de sede.`,
    site_day: `Lo verán quienes sirven el ${DAY_LABEL[day] ?? day} en ${siteName}, y su líder de sede.`,
    day: `Lo verán quienes sirven el ${DAY_LABEL[day] ?? day} en cualquier sede, y los líderes de sede.`,
    group: group ? `Lo verán las personas de ${groupLabel(group)} (${group.siteName}) y el líder de la sede.` : "Elige el grupo.",
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const starts = fromInputValue(startsAt);
      const ends = fromInputValue(endsAt);
      if (startsAt && !starts) throw new Error("La fecha de publicación no es válida.");
      if (endsAt && !ends) throw new Error("La fecha «vigente hasta» no es válida.");
      await saveAnnouncement(sb, {
        title, body, category, pinned, startsAt: starts, endsAt: ends,
        scope: { kind, siteId, day, groupId },
        links: links.filter((l) => l.label.trim() || l.url.trim()).map(({ label: lb, url }) => ({ label: lb, url })),
      }, item?.id);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-[90vh] flex-col">
      <form onSubmit={submit} className="space-y-4 overflow-y-auto p-6" aria-label={item ? "Editar novedad" : "Nueva novedad"}>
        <h2 className="text-xl font-extrabold text-link">{item ? "Editar novedad" : "Nueva novedad"}</h2>

        <div>
          <label className={label} htmlFor="an-title">Título</label>
          <input id="an-title" className={input} value={title} maxLength={140} required onChange={(e) => setTitle(e.target.value)} placeholder="Cambio de horario del ensayo" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="an-cat">Tipo</label>
            <select id="an-cat" className={input} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />📌 Fijar arriba</label>
        </div>
        <div>
          <label className={label} htmlFor="an-body">Mensaje</label>
          <textarea id="an-body" className={`${input} min-h-32`} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} placeholder="Los enlaces que escribas aquí se podrán abrir." />
        </div>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">¿Quién lo verá?</legend>
          <div>
            <label className={label} htmlFor="an-kind">Alcance</label>
            <select id="an-kind" className={input} value={kind} disabled={kinds.length === 1} onChange={(e) => setKind(e.target.value as ScopeKind)}>
              {kinds.map((k) => <option key={k} value={k}>{viewer.kind === "coordinator" ? "Mi grupo" : KIND_LABEL[k]}</option>)}
            </select>
          </div>
          {(kind === "site" || kind === "site_day") && (
            <div>
              <label className={label} htmlFor="an-site">Sede</label>
              <select id="an-site" className={input} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {(kind === "site_day" || kind === "day") && (
            <div>
              <label className={label} htmlFor="an-day">Día</label>
              <select id="an-day" className={input} value={day} onChange={(e) => setDay(e.target.value)}>
                {Object.entries(DAY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          {kind === "group" && (
            <div>
              <label className={label} htmlFor="an-group">Grupo</label>
              <GroupSelect id="an-group" label="Grupo de la novedad" groups={groups} value={groupId} onChange={setGroupId} disabled={viewer.kind === "coordinator"} />
            </div>
          )}
          <p className="text-sm text-muted" role="note">{audience[kind]}</p>
        </fieldset>

        <fieldset className="space-y-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Enlaces (opcional)</legend>
          {links.map((l, i) => (
            <div key={l.tmp} className="flex flex-wrap gap-2">
              <input className={`${input} min-w-40 flex-1`} aria-label={`Texto del enlace ${i + 1}`} placeholder="Programa del culto" value={l.label} maxLength={80} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className={`${input} min-w-48 flex-[2]`} aria-label={`Dirección del enlace ${i + 1}`} placeholder="https://…" inputMode="url" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button type="button" className={btnDanger} aria-label={`Quitar enlace ${i + 1}`} onClick={() => setLinks(links.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {links.length < MAX_LINKS && <button type="button" className={btn} onClick={() => setLinks([...links, { id: "", label: "", url: "", tmp: crypto.randomUUID() }])}>＋ Agregar enlace</button>}
        </fieldset>

        <fieldset className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2">
          <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Vigencia (hora de Colombia)</legend>
          <div>
            <label className={label} htmlFor="an-start">Publicar el (vacío = ahora)</label>
            <input id="an-start" type="datetime-local" className={input} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="an-end">Vigente hasta (opcional)</label>
            <input id="an-end" type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </fieldset>

        <ErrorText error={error} />
        <div className="flex flex-wrap gap-2">
          <button className={btnPrimary} disabled={busy}>{busy ? "Guardando…" : item ? "Guardar cambios" : "Publicar"}</button>
          {item && (
            <button type="button" className={btnDanger} disabled={busy} onClick={async () => {
              if (!window.confirm(`¿Eliminar la novedad «${item.title}»? No se puede deshacer.`)) return;
              setBusy(true);
              try { await deleteAnnouncement(sb, item.id); onSaved(); onClose(); } catch (err) { setError((err as Error).message); setBusy(false); }
            }}>Eliminar novedad</button>
          )}
        </div>
      </form>
      <button type="button" onClick={onClose} className="shrink-0 bg-wine p-4 font-bold text-white">CERRAR</button>
    </div>
  );
}
