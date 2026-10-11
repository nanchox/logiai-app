"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { DAY_LABEL, SHIFT_LABEL } from "@/lib/labels";
import { createClient } from "@/lib/supabase/client";
import { removePinFromMap, savePins } from "@/lib/manual/mutations";
import { appliesTo, type Variant, type ViewerMap, type ViewerMarker, type ViewerPosition, type ViewerZone } from "@/lib/manual/types";
import { MapAdmin } from "./MapAdmin";
import { MapStage, type Pin } from "./MapStage";
import { PositionEditor } from "./PositionEditor";
import { PositionSheet } from "./PositionSheet";
import { btn, btnDanger, btnPrimary, ErrorText, input } from "./ui";

const MOBILE_QUERY = "(max-width: 768px)";
const subscribeMobile = (cb: () => void) => {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);

type Props = {
  siteSlug: string;
  locationId: string;
  canManage: boolean;
  maps: ViewerMap[];
  zones: ViewerZone[];
  positions: ViewerPosition[];
  markers: ViewerMarker[];
  defaultDay: string;
  defaultShift: string;
};

const keyOf = (positionId: string, mapId: string, variant: Variant) => `${positionId}|${mapId}|${variant}`;

export function ManualClient({ siteSlug, locationId, canManage, maps, zones, positions, markers, defaultDay, defaultShift }: Props) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const isMobile = useIsMobile();

  const [mapId, setMapId] = useState(maps[0]?.id ?? "");
  const [day, setDay] = useState(defaultDay);
  const [shift, setShift] = useState(defaultShift);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [variant, setVariant] = useState<Variant>("desktop");
  const [drafts, setDrafts] = useState<Record<string, { top: number; left: number }>>({});
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ positionId: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const map = maps.find((m) => m.id === mapId) ?? maps[0] ?? null;
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const editVariant: Variant = map?.isGeneral ? "desktop" : variant;
  const pending = Object.keys(drafts).length;

  const refresh = () => router.refresh();

  // ── Marcadores de este mapa, ya con los borradores aplicados ──
  const mapMarkers = useMemo(() => markers.filter((m) => map && m.mapId === map.id), [markers, map]);
  const resolve = (positionId: string, v: Variant): { top: number; left: number; inherited: boolean } | null => {
    if (!map) return null;
    const draft = drafts[keyOf(positionId, map.id, v)];
    if (draft) return { ...draft, inherited: false };
    const own = mapMarkers.find((m) => m.positionId === positionId && m.variant === v);
    if (own) return { top: own.top, left: own.left, inherited: false };
    if (v === "mobile") {
      const base = resolve(positionId, "desktop");
      return base ? { ...base, inherited: true } : null;
    }
    return null;
  };

  const pins: Pin[] = useMemo(() => {
    if (!map) return [];
    const v: Variant = editing ? editVariant : isMobile ? "mobile" : "desktop";
    const out: Pin[] = [];
    for (const p of positions) {
      if (!editing && !appliesTo(p, day, shift)) continue;
      const at = resolve(p.id, v);
      if (!at) continue;
      out.push({
        key: p.id, positionId: p.id, code: p.code, kind: p.kind, top: at.top, left: at.left,
        inherited: editing && at.inherited, dim: !p.isActive, selected: editing && p.id === selectedId,
        label: `${p.name}${p.zoneName ? `, ${p.zoneName}` : ""}`,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolve depende de drafts/mapMarkers, ya listados
  }, [map, positions, editing, editVariant, isMobile, day, shift, drafts, mapMarkers, selectedId]);

  const pinned = new Set(pins.map((p) => p.positionId));
  const visible = positions.filter((p) => editing || appliesTo(p, day, shift));
  const hiddenByFilter = editing ? 0 : positions.filter((p) => p.isActive).length - positions.filter((p) => p.isActive && appliesTo(p, day, shift)).length;
  const onMap = visible.filter((p) => pinned.has(p.id)).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  const elsewhere = visible.filter((p) => !pinned.has(p.id)).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true }));
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const editorPosition = editor?.positionId ? byId.get(editor.positionId) ?? null : null;
  const nextCode = String(positions.reduce((n, p) => Math.max(n, Number.parseInt(p.code, 10) || 0), 0) + 1);

  // ── Edición de pines ──
  const movePin = (positionId: string, top: number, left: number) => {
    if (!map) return;
    setDrafts((d) => ({ ...d, [keyOf(positionId, map.id, editVariant)]: { top, left } }));
  };
  const placePin = (top: number, left: number) => {
    if (!map || !placingId) return;
    const variants: Variant[] = map.isGeneral ? ["desktop"] : ["desktop", "mobile"];
    setDrafts((d) => ({ ...d, ...Object.fromEntries(variants.map((v) => [keyOf(placingId, map.id, v), { top, left }])) }));
    setSelectedId(placingId);
    setPlacingId(null);
  };

  async function savePending() {
    setSaving(true);
    setError(null);
    try {
      const upserts = Object.entries(drafts).map(([k, v]) => {
        const [positionId, mId, vr] = k.split("|");
        return { positionId, mapId: mId, variant: vr as Variant, top: v.top, left: v.left };
      });
      await savePins(sb, upserts, []);
      setDrafts({});
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeSelectedPin() {
    if (!map || !selectedId) return;
    setError(null);
    try {
      await removePinFromMap(sb, selectedId, map.id);
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith(`${selectedId}|${map.id}|`))));
      setSelectedId(null);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const leaveEditing = () => {
    if (pending && !window.confirm("Hay cambios sin guardar en los pines. ¿Descartarlos?")) return;
    setDrafts({});
    setPlacingId(null);
    setSelectedId(null);
    setEditing(false);
    setError(null);
  };

  const onPinClick = (id: string) => setSelectedId(id);

  return (
    <div className="space-y-4">
      {/* Barra superior: mapas, filtros y modo edición */}
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Mapas" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {maps.map((m) => (
            <button key={m.id} role="tab" aria-selected={m.id === map?.id} onClick={() => setMapId(m.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${m.id === map?.id ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-primary"}`}>
              {m.name}
            </button>
          ))}
        </div>
        {canManage && (
          <button type="button" className={editing ? btnPrimary : btn} onClick={() => (editing ? leaveEditing() : setEditing(true))} aria-pressed={editing}>
            {editing ? "✓ Terminar edición" : "✎ Editar"}
          </button>
        )}
      </div>

      {!editing && positions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">Día
            <select className={`${input} w-auto`} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Filtrar por día">
              <option value="all">Todos</option>
              {Object.entries(DAY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">Franja
            <select className={`${input} w-auto`} value={shift} onChange={(e) => setShift(e.target.value)} aria-label="Filtrar por franja">
              <option value="all">Todas</option>
              {Object.entries(SHIFT_LABEL).map(([v, l]) => <option key={v} value={v}>{l || "Única"}</option>)}
            </select>
          </label>
          {hiddenByFilter > 0 && <span className="text-muted">{hiddenByFilter} posición(es) no aplican a este día/franja.</span>}
        </div>
      )}

      {editing && (
        <div className="space-y-3 rounded-2xl border border-accent/60 bg-surface p-4" role="region" aria-label="Herramientas de edición">
          <div className="flex flex-wrap items-center gap-2">
            {map && !map.isGeneral && (
              <div role="group" aria-label="Variante de coordenadas" className="flex overflow-hidden rounded-lg border border-line">
                {(["desktop", "mobile"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={variant === v} onClick={() => setVariant(v)}
                    className={`px-3 py-2 text-sm font-semibold ${variant === v ? "bg-accent text-on-accent" : "bg-bg"}`}>
                    {v === "desktop" ? "🖥 Escritorio" : "📱 Móvil"}
                  </button>
                ))}
              </div>
            )}
            <button type="button" className={btn} onClick={() => setEditor({ positionId: null })}>＋ Nueva posición</button>
            <span className="flex-1" />
            <button type="button" className={btnPrimary} disabled={!pending || saving} onClick={savePending}>
              {saving ? "Guardando…" : `Guardar pines${pending ? ` (${pending})` : ""}`}
            </button>
            <button type="button" className={btn} disabled={!pending || saving} onClick={() => setDrafts({})}>Descartar</button>
          </div>
          <p className="text-sm text-muted">
            Arrastra un pin para moverlo (o selecciónalo y usa las flechas; Mayús = pasos grandes).
            {map && !map.isGeneral && editVariant === "mobile" && " Editas las coordenadas móviles: el pin punteado aún usa las de escritorio."}
          </p>
          {placingId && (
            <p role="status" className="rounded-lg bg-accent px-3 py-2 text-sm font-bold text-on-accent">
              Toca el mapa para ubicar «{byId.get(placingId)?.name}». <button type="button" className="underline" onClick={() => setPlacingId(null)}>Cancelar</button>
            </p>
          )}
          {selected && !placingId && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg p-2 text-sm">
              <strong className="mr-auto">Pin {selected.code} · {selected.name}</strong>
              <button type="button" className={btn} onClick={() => setEditor({ positionId: selected.id })}>Editar datos y medios</button>
              {pinned.has(selected.id) && <button type="button" className={btnDanger} onClick={removeSelectedPin}>Quitar de este mapa</button>}
            </div>
          )}
          <ErrorText error={error} />
        </div>
      )}

      {map ? (
        <div id="map-stage" className="scroll-mt-20">
        <MapStage
          url={map.url} name={map.name} general={map.isGeneral} pins={pins}
          editable={editing} placing={!!placingId}
          onPinClick={onPinClick} onPinMove={movePin} onPlace={placePin}
        />
        </div>
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Este espacio aún no tiene mapas cargados.{canManage && !editing && " Pulsa «Editar» para agregar uno."}</p>
      )}

      {editing && (
        <MapAdmin siteSlug={siteSlug} locationId={locationId} maps={maps} current={map} open={!map}
          onChanged={(focus) => { if (focus) setMapId(focus); refresh(); }} />
      )}

      {/* Listas de posiciones */}
      <section aria-label="Posiciones">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">
          {editing ? `Posiciones del espacio (${visible.length})` : `Posiciones en este mapa (${onMap.length})`}
        </h2>
        <PositionList positions={editing ? [...onMap, ...elsewhere] : onMap} editing={editing} pinned={pinned} selectedId={selectedId}
          onOpen={(id) => (editing ? setSelectedId(id) : setSelectedId(id))}
          onEdit={(id) => setEditor({ positionId: id })}
          onPlace={map ? (id) => { setPlacingId(id); setSelectedId(id); document.getElementById("map-stage")?.scrollIntoView({ block: "center" }); } : undefined} />
        {!editing && elsewhere.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-muted">Otras posiciones de este espacio ({elsewhere.length})</summary>
            <div className="mt-2"><PositionList positions={elsewhere} editing={false} pinned={pinned} selectedId={selectedId} onOpen={setSelectedId} onEdit={() => {}} /></div>
          </details>
        )}
        {positions.length === 0 && <p className="text-sm text-muted">Todavía no hay posiciones en este espacio.</p>}
      </section>

      <PositionSheet position={editing ? null : selected} onClose={() => setSelectedId(null)} />
      <PositionEditor
        open={!!editor} position={editorPosition} siteSlug={siteSlug} locationId={locationId} zones={zones} nextCode={nextCode}
        onClose={() => setEditor(null)}
        onChanged={(createdId) => { if (createdId) setEditor({ positionId: createdId }); refresh(); }}
      />
    </div>
  );
}

function PositionList({ positions, editing, pinned, selectedId, onOpen, onEdit, onPlace }: {
  positions: ViewerPosition[]; editing: boolean; pinned: Set<string>; selectedId: string | null;
  onOpen: (id: string) => void; onEdit: (id: string) => void; onPlace?: (id: string) => void;
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {positions.map((p) => (
        <li key={p.id} className={`flex items-center gap-2 rounded-xl border bg-surface p-2 ${editing && p.id === selectedId ? "border-accent" : "border-line"}`}>
          <button type="button" onClick={() => onOpen(p.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:bg-bg">
            <span className={`grid h-8 w-8 shrink-0 place-items-center text-xs font-black ${p.kind === "supervisor" ? "rounded-md bg-danger text-white" : "rounded-full bg-info text-on-info"}`}>{p.code}</span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-muted">
                {[p.zoneName, !p.isActive && "oculta", editing && !pinned.has(p.id) && "sin pin en este mapa"].filter(Boolean).join(" · ") || " "}
              </span>
            </span>
          </button>
          {editing && (
            <span className="flex shrink-0 gap-1">
              {!pinned.has(p.id) && onPlace && <button type="button" className={btn} onClick={() => onPlace(p.id)}>Colocar</button>}
              <button type="button" className={btn} onClick={() => onEdit(p.id)} aria-label={`Editar ${p.name}`}>Editar</button>
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
