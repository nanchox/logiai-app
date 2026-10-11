// Genera la migración de carga inicial a partir del prototipo (legacy/index.html).
// Uso: node scripts/generate-seed.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync(new URL('../legacy/index.html', import.meta.url), 'utf8');
const match = html.match(/const positions = (\[[\s\S]*?\n\s*\]);/);
if (!match) throw new Error('No se encontró el arreglo positions en legacy/index.html');
const positions = new Function(`return ${match[1]}`)();

const q = (s) => `$q$${s}$q$`;
const AUD = 'auditorio-principal';
const mapPath = (name) => `castellana/${AUD}/${name}.png`;

// 'ZONA 3' -> [3]; 'ZONAS 1, 2, 3, 4' -> [1, 2, 3, 4]
const zonesOf = (p) => [...p.zone.matchAll(/\d+/g)].map((m) => Number(m[0]));

let radioCount = 0;
const rows = positions.map((p) => {
  const zones = zonesOf(p);
  const radio = /^RADIO\.\s*/.test(p.task);
  if (radio) radioCount++;
  return {
    code: String(p.id),
    name: p.label,
    kind: p.type === 'sup' ? 'supervisor' : 'voluntario',
    single: zones.length === 1 ? zones[0] : null,
    zones,
    description: p.task.replace(/^RADIO\.\s*/, ''),
    radio,
    g: p.g, z: p.z, m: p.m,
  };
});

const out = [];
out.push(`-- LogiAI · Fase 1 · Carga inicial (generada con scripts/generate-seed.mjs desde legacy/index.html)
-- Sedes, auditorios/salones, mapa y posiciones de Castellana · Auditorio principal, y correos de arranque.
-- Las imágenes se suben después con: npx tsx --env-file=.env.local scripts/upload-seed-assets.mts

insert into public.sites (slug, name, sort) values
  ('castellana', 'Castellana', 1), ('nogal', 'Nogal', 2), ('suba', 'Suba', 3), ('campestre', 'Campestre', 4);

insert into public.locations (site_id, kind, name, sort)
select s.id, v.kind::public.location_kind, v.name, v.sort
from (values
  ('castellana', 'auditorio', 'Auditorio principal', 1),
  ('castellana', 'teatro',    'Teatro',               2),
  ('castellana', 'overflow',  'Overflow piso 4',      3),
  ('castellana', 'overflow',  'Overflow piso 5',      4),
  ('castellana', 'salon',     'Salones',              5),
  ('suba',       'auditorio', 'Auditorio principal',  1),
  ('suba',       'overflow',  'Overflow',             2),
  ('campestre',  'auditorio', 'Auditorio principal',  1),
  ('campestre',  'salon',     'Salones',              2),
  ('nogal',      'auditorio', 'Auditorio',            1),
  ('nogal',      'salon',     'Salón',                2)
) as v(slug, kind, name, sort)
join public.sites s on s.slug = v.slug;

update public.locations l set manual_url = 'https://docs.google.com/presentation/d/1zOMZvFh3L4ebRN9OmGpXYsv_PGh8AYv2SqOEjxcFs9c/embed?slide=id.gc6f980f91_0_33'
from public.sites s where s.id = l.site_id and s.slug = 'castellana' and l.name = 'Auditorio principal';
`);

out.push(`-- Castellana · Auditorio principal: zonas 1 a 6, mapas y posiciones
do $seed$
declare
  v_loc  uuid;
  v_zone uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id
   where s.slug = 'castellana' and l.name = 'Auditorio principal';

  insert into public.maps (location_id, zone_id, name, image_path, sort)
  values (v_loc, null, 'Mapa general', ${q(mapPath('general'))}, 0);

  for i in 1..6 loop
    insert into public.zones (location_id, name, kind, sort) values (v_loc, 'Zona ' || i, 'acomodacion', i) returning id into v_zone;
    insert into public.maps (location_id, zone_id, name, image_path, sort)
    values (v_loc, v_zone, 'Zona ' || i, 'castellana/${AUD}/zona-' || i || '.png', i);
  end loop;
end
$seed$;
`);

for (const p of rows) {
  const zoneSel = p.single ? `(select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona ${p.single}')` : 'null';
  out.push(`do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, ${zoneSel}, '${p.code}', ${q(p.name)}, '${p.kind}', ${q(p.description)}, ${p.radio}, ${p.code}) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', ${p.g.t}, ${p.g.l} from public.maps m where m.location_id = v_loc and m.zone_id is null;
${p.zones.map((n) => {
    const zsel = `select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona ${n}'`;
    const lines = [`  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (${zsel}), 'desktop', ${p.z.t}, ${p.z.l};`];
    if (p.m) lines.push(`  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (${zsel}), 'mobile', ${p.m.t}, ${p.m.l};`);
    return lines.join('\n');
  }).join('\n')}
end
$seed$;
`);
}

out.push(`-- Correos de arranque
insert into public.invitations (email, is_admin, is_head) values
  ('hhherrerap@gmail.com', true,  false),   -- desarrollador / administrador
  ('mreyes@supresencia.com', false, true);  -- cabeza de ministerio
`);

writeFileSync(new URL('../supabase/migrations/20261002000005_seed.sql', import.meta.url), out.join('\n'));
console.log(`posiciones: ${rows.length}, con radio: ${radioCount}`);
console.log(rows.filter((r) => !r.single).map((r) => `${r.code} ${r.name} -> zonas ${r.zones}`).join('\n'));
