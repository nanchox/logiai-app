import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapViewer, type ViewerMap, type ViewerMarker, type ViewerPosition } from "@/components/MapViewer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mapa" };

export default async function LocationPage({ params }: PageProps<"/manual/[site]/[location]">) {
  const { site: slug, location: locationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) notFound();

  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id, name, sites!inner(slug, name)")
    .eq("id", locationId)
    .maybeSingle();
  const site = (location as unknown as { sites: { slug: string; name: string } } | null)?.sites;
  if (!location || !site || site.slug !== slug) notFound();

  const [mapsRes, positionsRes] = await Promise.all([
    supabase.from("maps").select("id, name, zone_id, image_path, image_version, sort").eq("location_id", location.id).order("sort"),
    supabase
      .from("positions")
      .select("id, code, name, kind, description, uses_radio, days, shifts, sort, zones(name)")
      .eq("location_id", location.id)
      .eq("is_active", true)
      .order("sort"),
  ]);
  const maps = mapsRes.data ?? [];
  const positions = positionsRes.data ?? [];

  const [markersRes, signed] = await Promise.all([
    maps.length
      ? supabase.from("position_markers").select("position_id, map_id, variant, top_pct, left_pct").in("map_id", maps.map((m) => m.id))
      : Promise.resolve({ data: [] }),
    maps.length ? supabase.storage.from("maps").createSignedUrls(maps.map((m) => m.image_path), 3600) : Promise.resolve({ data: [] }),
  ]);
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  const viewerMaps: ViewerMap[] = maps.map((m) => ({
    id: m.id,
    name: m.name,
    isGeneral: m.zone_id === null,
    url: urlByPath.get(m.image_path) ?? null,
  }));
  const viewerPositions: ViewerPosition[] = positions.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    kind: p.kind,
    description: p.description,
    usesRadio: p.uses_radio,
    zoneName: (p as unknown as { zones: { name: string } | null }).zones?.name ?? null,
    days: p.days,
    shifts: p.shifts,
  }));
  const viewerMarkers: ViewerMarker[] = (markersRes.data ?? []).map((m) => ({
    positionId: m.position_id,
    mapId: m.map_id,
    variant: m.variant,
    top: Number(m.top_pct),
    left: Number(m.left_pct),
  }));

  return (
    <main>
      <p className="text-sm text-muted">
        <Link href="/manual">Manual</Link> / <Link href={`/manual/${slug}`}>{site.name}</Link> / {location.name}
      </p>
      <h1 className="mb-4 mt-1 text-2xl font-extrabold">{location.name}</h1>
      {viewerMaps.length ? (
        <MapViewer maps={viewerMaps} positions={viewerPositions} markers={viewerMarkers} />
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-5 text-muted">Este espacio aún no tiene mapas cargados.</p>
      )}
    </main>
  );
}
