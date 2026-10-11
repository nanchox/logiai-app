import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerMap, ViewerMarker, ViewerMedia, ViewerPosition, ViewerZone } from "./types";

type Embedded<T> = { [k: string]: T } | null;

/** Todo lo que necesita la pantalla de un espacio (mapas, zonas, posiciones con medios y pines). */
export async function loadLocation(supabase: SupabaseClient, locationId: string, includeInactive: boolean) {
  const positionsQuery = supabase
    .from("positions")
    .select("id, code, name, kind, description, uses_radio, zone_id, days, shifts, is_active, sort, zones(name)")
    .eq("location_id", locationId)
    .order("sort")
    .order("code");

  const [mapsRes, zonesRes, positionsRes] = await Promise.all([
    supabase.from("maps").select("id, name, zone_id, image_path, image_version, sort").eq("location_id", locationId).order("sort"),
    supabase.from("zones").select("id, name, kind").eq("location_id", locationId).order("sort"),
    includeInactive ? positionsQuery : positionsQuery.eq("is_active", true),
  ]);
  const maps = mapsRes.data ?? [];
  const positions = positionsRes.data ?? [];
  const positionIds = positions.map((p) => p.id);

  const [markersRes, mediaRes, mapUrls] = await Promise.all([
    maps.length
      ? supabase.from("position_markers").select("position_id, map_id, variant, top_pct, left_pct").in("map_id", maps.map((m) => m.id))
      : Promise.resolve({ data: [] }),
    positionIds.length
      ? supabase.from("position_media").select("id, position_id, kind, url, storage_path, caption, sort").in("position_id", positionIds).order("sort").order("created_at")
      : Promise.resolve({ data: [] }),
    maps.length ? supabase.storage.from("maps").createSignedUrls(maps.map((m) => m.image_path), 3600) : Promise.resolve({ data: [] }),
  ]);

  const media = mediaRes.data ?? [];
  const photoPaths = media.filter((m) => m.kind === "foto").map((m) => m.storage_path as string);
  const photoUrls = photoPaths.length ? await supabase.storage.from("position-media").createSignedUrls(photoPaths, 3600) : { data: [] };
  const mapUrlByPath = new Map((mapUrls.data ?? []).map((s) => [s.path, s.signedUrl]));
  const photoUrlByPath = new Map((photoUrls.data ?? []).map((s) => [s.path, s.signedUrl]));

  const mediaByPosition = new Map<string, ViewerMedia[]>();
  for (const m of media) {
    const item: ViewerMedia = {
      id: m.id,
      kind: m.kind,
      url: m.kind === "foto" ? (photoUrlByPath.get(m.storage_path as string) ?? null) : m.url,
      path: m.storage_path,
      caption: m.caption,
    };
    mediaByPosition.set(m.position_id, [...(mediaByPosition.get(m.position_id) ?? []), item]);
  }

  const viewerMaps: ViewerMap[] = maps.map((m) => ({
    id: m.id,
    name: m.name,
    zoneId: m.zone_id,
    isGeneral: m.zone_id === null,
    url: mapUrlByPath.get(m.image_path) ?? null,
    version: m.image_version,
    imagePath: m.image_path,
  }));
  const viewerZones: ViewerZone[] = (zonesRes.data ?? []).map((z) => ({ id: z.id, name: z.name, kind: z.kind }));
  const viewerPositions: ViewerPosition[] = positions.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    kind: p.kind,
    description: p.description,
    usesRadio: p.uses_radio,
    zoneId: p.zone_id,
    zoneName: (p.zones as unknown as Embedded<string>)?.name ?? null,
    days: p.days ?? [],
    shifts: p.shifts ?? [],
    isActive: p.is_active,
    media: mediaByPosition.get(p.id) ?? [],
  }));
  const viewerMarkers: ViewerMarker[] = (markersRes.data ?? []).map((m) => ({
    positionId: m.position_id,
    mapId: m.map_id,
    variant: m.variant,
    top: Number(m.top_pct),
    left: Number(m.left_pct),
  }));

  return { maps: viewerMaps, zones: viewerZones, positions: viewerPositions, markers: viewerMarkers };
}
