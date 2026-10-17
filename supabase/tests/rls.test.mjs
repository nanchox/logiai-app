// Pruebas de las migraciones y los permisos (RLS) sobre Postgres en WASM (PGlite).
// Ejecutar: npm run test:db
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../migrations/', import.meta.url);
let db;

// Simulación mínima de lo que Supabase ya trae (auth, storage, roles).
const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role, supabase_auth_admin;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  grant all on storage.objects to authenticated;
`;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  }
});

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const rows = async (sql, params) => (await db.query(sql, params)).rows;

async function as(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const denied = (fn, re = /./) => assert.rejects(fn, re);
const count = async (table, where = 'true') => Number((await one(`select count(*)::int n from public.${table} where ${where}`)).n);

const U = {}; // nombre → uuid

async function signup(name, email) {
  const r = await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify({ full_name: name })]);
  U[name] = r.id;
}
const invite = (email, extra = '') => db.exec(`insert into public.invitations (email${extra ? ', ' + extra.split('=')[0] : ''}) values ('${email}'${extra ? ', ' + extra.split('=')[1] : ''})`);

test('carga inicial: sedes, locations, mapas, posiciones y pines del prototipo', async () => {
  assert.equal(await count('sites'), 4);
  assert.equal(await count('locations'), 11);
  assert.equal(await count('zones'), 6);
  assert.equal(await count('maps'), 7);
  assert.equal(await count('positions'), 28);
  // 28 pines en el mapa general + (26 posiciones × 1 zona + 2 supervisores × 2 zonas... ) × 2 variantes (escritorio y móvil)
  assert.equal(await count('position_markers', `variant = 'desktop'`), 28 + 26 + 6);
  assert.equal(await count('position_markers', `variant = 'mobile'`), 26 + 6);
  assert.equal(await count('positions', `uses_radio`), 3);
  const sup = await rows(`select name, zone_id from public.positions where kind = 'supervisor' order by sort`);
  assert.deepEqual(sup.map((s) => s.zone_id), [null, null]);
});

test('acceso por invitación: sin invitación no hay cuenta', async () => {
  await denied(() => signup('intruso', 'intruso@gmail.com'), /no autorizado/i);
  assert.deepEqual(await one(`select public.hook_before_user_created('{"user":{"email":"HHHerrerap@gmail.com"}}'::jsonb) r`), { r: {} });
  const bad = await one(`select public.hook_before_user_created('{"user":{"email":"x@y.com"}}'::jsonb) r`);
  assert.equal(bad.r.error.http_code, 403);

  await signup('admin', 'hhherrerap@gmail.com');
  await signup('cabeza', 'mreyes@supresencia.com');
  const a = await one(`select is_admin, is_head, full_name from public.profiles where user_id = $1`, [U.admin]);
  assert.deepEqual(a, { is_admin: true, is_head: false, full_name: 'admin' });
  assert.equal((await one(`select is_head from public.profiles where user_id = $1`, [U.cabeza])).is_head, true);
  assert.ok((await one(`select accepted_at from public.invitations where email = 'hhherrerap@gmail.com'`)).accepted_at);
});

test('estructura: grupos, líderes, coordinadores, supervisores y voluntarios', async () => {
  await db.exec(`
    insert into public.service_slots (site_id, day, shift)
      select s.id, v.d::public.service_day, v.sh::public.service_shift from public.sites s
      join (values ('castellana','sabado','pm'), ('suba','domingo','unica'), ('nogal','miercoles','unica')) v(slug, d, sh) on v.slug = s.slug;
    insert into public.groups (service_slot_id, name) select id, 'Grupo 1' from public.service_slots;
    insert into public.groups (service_slot_id, name) select id, 'Grupo 2' from public.service_slots where day = 'sabado';`);

  const g = async (site, name) => (await one(`select g.id from public.groups g join public.service_slots s on s.id = g.service_slot_id join public.sites si on si.id = s.site_id where si.slug = $1 and g.name = $2`, [site, name])).id;
  U.gCas1 = await g('castellana', 'Grupo 1'); U.gCas2 = await g('castellana', 'Grupo 2'); U.gSuba1 = await g('suba', 'Grupo 1');
  const site = async (slug) => (await one(`select id from public.sites where slug = $1`, [slug])).id;
  U.sCas = await site('castellana'); U.sNogal = await site('nogal');

  // El admin invita a un líder de sede (Castellana) y otro de Nogal
  await as(U.admin, async () => {
    await db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.cas@x.com', $1)`, [[U.sCas]]);
    await db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.nogal@x.com', $1)`, [[U.sNogal]]);
  });
  await signup('liderCas', 'lider.cas@x.com'); await signup('liderNogal', 'lider.nogal@x.com');
  assert.equal(await count('site_leaders'), 2);

  // El líder asigna coordinadores y supervisores
  await as(U.liderCas, async () => {
    for (const [email, role] of [['coord1@x.com', 'coordinador'], ['coord2@x.com', 'coordinador'], ['sup1@x.com', 'supervisor']])
      await db.query(`insert into public.invitations (email, group_id, group_role) values ($1, $2, $3)`, [email, U.gCas1, role]);
  });
  for (const n of ['coord1', 'coord2', 'sup1']) await signup(n, `${n}@x.com`);

  // El coordinador agrega voluntarios y supervisores a SU grupo
  await as(U.coord1, async () => {
    await db.query(`insert into public.invitations (email, group_id, group_role) values ('vol1@x.com', $1, 'voluntario')`, [U.gCas1]);
    await db.query(`insert into public.invitations (email, group_id, group_role) values ('sup2@x.com', $1, 'supervisor')`, [U.gCas1]);
  });
  await signup('vol1', 'vol1@x.com'); await signup('sup2', 'sup2@x.com');

  // Grupo de Suba con su voluntario
  await invite('volsuba@x.com'); // invitación sin grupo (sin rol): luego se asigna la membresía a mano
  await as(U.admin, () => db.query(`delete from public.invitations where email = 'volsuba@x.com'`));
  await as(U.admin, () => db.query(`insert into public.invitations (email, group_id, group_role) values ('volsuba@x.com', $1, 'voluntario')`, [U.gSuba1]));
  await signup('volSuba', 'volsuba@x.com');
  assert.equal(await count('memberships'), 6);
});

test('un grupo no puede tener más de 2 coordinadores', async () => {
  await as(U.liderCas, () => db.query(`insert into public.invitations (email, group_id, group_role) values ('coord3@x.com', $1, 'coordinador')`, [U.gCas1]));
  await denied(() => signup('coord3', 'coord3@x.com'), /2 coordinadores/);
  await db.exec(`delete from public.invitations where email = 'coord3@x.com'`);
  // y tampoco ascendiendo a un supervisor
  await denied(() => db.query(`update public.memberships set role = 'coordinador' where user_id = $1`, [U.sup1]), /2 coordinadores/);
});

test('una persona solo puede estar en un grupo; líderes, cabeza y admin no tienen grupo', async () => {
  await denied(() => db.query(`insert into public.memberships (user_id, group_id, role) values ($1, $2, 'voluntario')`, [U.vol1, U.gCas2]), /duplicate|unique/i);
  await denied(() => db.query(`insert into public.memberships (user_id, group_id, role) values ($1, $2, 'supervisor')`, [U.liderCas, U.gCas1]), /no pertenecen a ningún grupo/);
  await denied(() => db.query(`insert into public.memberships (user_id, group_id, role) values ($1, $2, 'supervisor')`, [U.cabeza, U.gCas1]), /no pertenecen a ningún grupo/);
  await denied(() => db.query(`insert into public.memberships (user_id, group_id, role) values ($1, $2, 'supervisor')`, [U.admin, U.gCas1]), /no pertenecen a ningún grupo/);
  await denied(() => db.query(`insert into public.site_leaders (user_id, site_id) values ($1, $2)`, [U.vol1, U.sCas]), /no puede pertenecer a un grupo/);
});

test('visibilidad del manual: cada sede ve solo la suya; cabeza y admin ven todo', async () => {
  const seen = (uid) => as(uid, async () => ({
    sites: (await rows(`select slug from public.sites order by slug`)).map((r) => r.slug),
    positions: await count('positions'), markers: await count('position_markers'), maps: await count('maps'),
  }));
  for (const u of ['vol1', 'sup1', 'coord1', 'liderCas']) assert.deepEqual(await seen(U[u]), { sites: ['castellana'], positions: 28, markers: 92, maps: 7 }, u);
  assert.deepEqual((await seen(U.volSuba)).sites, ['suba']);
  assert.equal((await seen(U.volSuba)).positions, 0);               // Suba aún no tiene posiciones cargadas
  assert.deepEqual((await seen(U.liderNogal)).sites, ['nogal']);
  assert.equal((await seen(U.liderNogal)).positions, 0);             // no ve Castellana
  assert.equal((await seen(U.cabeza)).sites.length, 4);
  assert.equal((await seen(U.admin)).positions, 28);
});

test('grupos: un voluntario solo ve su grupo; el líder los de su sede; la cabeza todos', async () => {
  const groups = (uid) => as(uid, async () => (await rows(`select name, service_slot_id from public.groups`)).length);
  assert.equal(await groups(U.vol1), 1);
  assert.equal(await groups(U.volSuba), 1);
  assert.equal(await groups(U.liderCas), 2);    // Grupo 1 y Grupo 2 de Castellana
  assert.equal(await groups(U.liderNogal), 1);
  assert.equal(await groups(U.cabeza), 4);

  const people = (uid) => as(uid, async () => (await rows(`select full_name from public.profiles order by full_name`)).map((r) => r.full_name));
  assert.deepEqual(await people(U.vol1), ['coord1', 'coord2', 'sup1', 'sup2', 'vol1']);   // solo su grupo
  assert.deepEqual(await people(U.volSuba), ['volSuba']);
  assert.equal((await people(U.cabeza)).length, await count('profiles'));   // la cabeza ve a todos
  assert.equal(await as(U.vol1, () => count('memberships')), 5);
  assert.equal(await as(U.liderCas, () => count('memberships')), 5);
});

test('quién puede agregar correos y roles', async () => {
  const inv = (uid, email, group, role) => as(uid, () => db.query(`insert into public.invitations (email, group_id, group_role) values ($1, $2, $3)`, [email, group, role]));
  // El coordinador solo agrega supervisores/voluntarios a su grupo
  await inv(U.coord1, 'nuevo.vol@x.com', U.gCas1, 'voluntario');
  await denied(() => inv(U.coord1, 'nuevo.coord@x.com', U.gCas1, 'coordinador'), /row-level security/);
  await denied(() => inv(U.coord1, 'otro.grupo@x.com', U.gCas2, 'voluntario'), /row-level security/);
  await denied(() => inv(U.coord1, 'suba@x.com', U.gSuba1, 'voluntario'), /row-level security/);
  // supervisor y voluntario no invitan
  await denied(() => inv(U.sup1, 'a@x.com', U.gCas1, 'voluntario'), /row-level security/);
  await denied(() => inv(U.vol1, 'b@x.com', U.gCas1, 'voluntario'), /row-level security/);
  // el líder de Castellana no toca grupos de otra sede ni crea líderes/admin
  await inv(U.liderCas, 'c@x.com', U.gCas2, 'coordinador');
  await denied(() => inv(U.liderCas, 'd@x.com', U.gSuba1, 'coordinador'), /row-level security/);
  await denied(() => inv(U.liderNogal, 'e@x.com', U.gCas1, 'supervisor'), /row-level security/);
  await denied(() => as(U.liderCas, () => db.query(`insert into public.invitations (email, is_admin) values ('f@x.com', true)`)), /row-level security/);
  await denied(() => as(U.liderCas, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('g@x.com', $1)`, [[U.sCas]])), /row-level security/);
  // la cabeza puede invitar líderes pero no otro admin/cabeza; el admin sí
  await as(U.cabeza, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('h@x.com', $1)`, [[U.sNogal]]));
  await denied(() => as(U.cabeza, () => db.query(`insert into public.invitations (email, is_head) values ('i@x.com', true)`)), /row-level security/);
  await as(U.admin, () => db.query(`insert into public.invitations (email, is_head) values ('j@x.com', true)`));
  // nadie puede invitar suplantando a otro
  await denied(() => as(U.coord1, () => db.query(`insert into public.invitations (email, group_id, group_role, invited_by) values ('k@x.com', $1, 'voluntario', $2)`, [U.gCas1, U.admin])), /row-level security/);
  // un coordinador solo ve las invitaciones de supervisores/voluntarios de su grupo (sup1, vol1, sup2, nuevo.vol)
  assert.equal(await as(U.coord1, () => count('invitations')), 4);
  assert.equal(await as(U.coord1, () => count('invitations', `email = 'c@x.com'`)), 0);   // la del grupo 2 no
  assert.equal(await as(U.vol1, () => count('invitations')), 0);
});

test('membresías: el coordinador gestiona su grupo pero no a otros coordinadores', async () => {
  await as(U.coord1, () => db.query(`update public.memberships set role = 'supervisor' where user_id = $1`, [U.vol1]));
  assert.equal((await one(`select role from public.memberships where user_id = $1`, [U.vol1])).role, 'supervisor');
  await as(U.coord1, () => db.query(`update public.memberships set role = 'voluntario' where user_id = $1`, [U.vol1]));
  // no puede degradar/quitar a otro coordinador ni ascender a nadie a coordinador ni mover gente a otro grupo
  const noop = async (sql, p) => as(U.coord1, async () => (await db.query(sql, p)).affectedRows);
  assert.equal(await noop(`delete from public.memberships where user_id = $1`, [U.coord2]), 0);
  assert.equal(await noop(`update public.memberships set role = 'supervisor' where user_id = $1`, [U.coord2]), 0);
  // (el trigger BEFORE de coordinadores corre antes que RLS; ambos bloquean)
  await denied(() => noop(`update public.memberships set role = 'coordinador' where user_id = $1`, [U.sup1]), /row-level security|2 coordinadores/);
  await denied(() => noop(`update public.memberships set group_id = $2 where user_id = $1`, [U.sup1, U.gCas2]), /row-level security/);
  assert.equal(await noop(`delete from public.memberships where user_id = $1`, [U.sup2]), 1);
  // los voluntarios no modifican nada
  assert.equal(await as(U.vol1, async () => (await db.query(`delete from public.memberships where user_id = $1`, [U.sup1])).affectedRows), 0);
  // el líder sí puede mover personas dentro de su sede, pero no a otra sede
  await as(U.liderCas, () => db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.sup1, U.gCas2]));
  await denied(() => as(U.liderCas, () => db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.sup1, U.gSuba1])), /row-level security/);
  await as(U.liderCas, () => db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.sup1, U.gCas1]));
});

test('perfiles: nadie puede darse permisos', async () => {
  await as(U.vol1, () => db.query(`update public.profiles set full_name = 'Voluntario Uno' where user_id = $1`, [U.vol1]));
  await denied(() => as(U.vol1, () => db.query(`update public.profiles set is_admin = true where user_id = $1`, [U.vol1])), /permission denied/);
  await denied(() => as(U.vol1, () => db.query(`update public.profiles set is_head = true where user_id = $1`, [U.vol1])), /permission denied/);
  assert.equal(await as(U.vol1, async () => (await db.query(`update public.profiles set full_name = 'x' where user_id = $1`, [U.coord1])).affectedRows), 0);
  await denied(() => as(U.admin, () => db.query(`insert into public.profiles (user_id, full_name) values (gen_random_uuid(), 'zz')`)), /permission denied|row-level security|violates/);
  // nadie se nombra líder de sede
  await denied(() => as(U.liderNogal, () => db.query(`insert into public.site_leaders (user_id, site_id) values ($1, $2)`, [U.liderNogal, U.sCas])), /row-level security/);
  await denied(() => as(U.vol1, () => db.query(`insert into public.site_leaders (user_id, site_id) values ($1, $2)`, [U.vol1, U.sCas])), /row-level security|no puede pertenecer/);
});

test('manual: el líder de la sede lo edita; voluntarios, supervisores y otras sedes no', async () => {
  const loc = (await one(`select l.id from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Teatro'`)).id;
  const newPos = (uid, l = loc) => as(uid, () => db.query(`insert into public.positions (location_id, code, name, kind, description) values ($1, 'T1', 'Puesto teatro', 'voluntario', 'Solo domingo') returning id`, [l]));
  await denied(() => newPos(U.vol1), /row-level security/);
  await denied(() => newPos(U.sup1), /row-level security/);
  await denied(() => newPos(U.coord1), /row-level security/);
  await denied(() => newPos(U.liderNogal), /row-level security/);
  const { rows: [p] } = await newPos(U.liderCas);
  await as(U.liderCas, () => db.query(`update public.positions set days = '{domingo}', shifts = '{am}' where id = $1`, [p.id]));
  assert.equal(await as(U.vol1, async () => (await db.query(`update public.positions set name = 'hack' where id = $1`, [p.id])).affectedRows), 0);
  // la cabeza edita cualquier sede; un voluntario de otra sede no ve esa posición
  assert.equal(await as(U.volSuba, () => count('positions', `id = '${p.id}'`)), 0);
  await as(U.cabeza, () => db.query(`update public.positions set is_active = false where id = $1`, [p.id]));
  // un pin no puede apuntar a un mapa de otra sede
  const gmap = (await one(`select id from public.maps where zone_id is null`)).id;
  await denied(() => as(U.liderNogal, () => db.query(`insert into public.position_markers (position_id, map_id, top_pct, left_pct) values ($1, $2, 10, 10)`, [p.id, gmap])), /row-level security/);
  // ni el líder de Castellana puede poner un pin de su posición sobre un mapa de Nogal
  const nogalLoc = (await one(`select l.id from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'nogal' limit 1`)).id;
  const nogalMap = (await one(`insert into public.maps (location_id, name, image_path) values ($1, 'Nogal', 'nogal/a.png') returning id`, [nogalLoc])).id;
  await denied(() => as(U.liderCas, () => db.query(`insert into public.position_markers (position_id, map_id, top_pct, left_pct) values ($1, $2, 10, 10)`, [p.id, nogalMap])), /row-level security/);
  // porcentajes válidos
  await denied(() => as(U.liderCas, () => db.query(`insert into public.position_markers (position_id, map_id, top_pct, left_pct) values ($1, $2, 120, 10)`, [p.id, gmap])), /check|violates/);
});

test('integridad: la zona de una posición debe ser de su misma location', async () => {
  const other = (await one(`select l.id from public.locations l where l.name = 'Teatro'`)).id;
  const zone = (await one(`select id from public.zones limit 1`)).id;
  await denied(() => db.query(`insert into public.positions (location_id, zone_id, code, name, kind) values ($1, $2, 'X', 'x', 'voluntario')`, [other, zone]), /foreign key/);
  await denied(() => db.query(`insert into public.maps (location_id, zone_id, name, image_path) values ($1, $2, 'x', 'x.png')`, [other, zone]), /foreign key/);
  await denied(() => db.query(`insert into public.maps (location_id, name, image_path) select location_id, 'otro', 'otro.png' from public.maps where zone_id is null`), /unique|duplicate/);
});

test('storage de mapas: ven los de su sede; solo líder/cabeza/admin suben', async () => {
  await db.exec(`insert into storage.objects (bucket_id, name) values ('maps', 'castellana/auditorio-principal/general.png'), ('maps', 'suba/auditorio/general.png')`);
  const names = (uid) => as(uid, async () => (await rows(`select name from storage.objects where bucket_id = 'maps'`)).map((r) => r.name));
  assert.deepEqual(await names(U.vol1), ['castellana/auditorio-principal/general.png']);
  assert.deepEqual(await names(U.volSuba), ['suba/auditorio/general.png']);
  assert.equal((await names(U.cabeza)).length, 2);
  await as(U.liderCas, () => db.query(`insert into storage.objects (bucket_id, name) values ('maps', 'castellana/teatro/general.png')`));
  await denied(() => as(U.liderCas, () => db.query(`insert into storage.objects (bucket_id, name) values ('maps', 'suba/x.png')`)), /row-level security/);
  await denied(() => as(U.vol1, () => db.query(`insert into storage.objects (bucket_id, name) values ('maps', 'castellana/x.png')`)), /row-level security/);
});

test('anon no puede leer nada', async () => {
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select * from public.positions`), /permission denied/); } finally { await db.exec(`reset role`); }
});

// ───────────── Fase 2 ─────────────
test('fase 2 · medios: solo https; YouTube solo de youtube.com/youtu.be; foto y enlace son excluyentes', async () => {
  const pos = (await one(`select id from public.positions where code = '2'`)).id;
  const ins = (kind, url, path) => db.query(`insert into public.position_media (position_id, kind, url, storage_path) values ($1, $2, $3, $4)`, [pos, kind, url, path]);
  await ins('youtube', 'https://youtu.be/dQw4w9WgXcQ', null);
  await ins('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null);
  await ins('link', 'https://docs.google.com/presentation/d/x', null);
  await ins('foto', null, 'castellana/pos/a.jpg');
  await denied(() => ins('youtube', 'https://vimeo.com/123', null), /check/);
  await denied(() => ins('youtube', 'https://evil.com/youtube.com/x', null), /check/);
  await denied(() => ins('link', 'javascript:alert(1)', null), /check/);
  await denied(() => ins('link', 'http://inseguro.com', null), /check/);
  await denied(() => ins('foto', 'https://x.com/a.jpg', 'a.jpg'), /check/);
  await denied(() => ins('foto', null, null), /check/);
  await denied(() => ins('link', null, null), /check/);
});

test('fase 2 · medios: los de la sede los ven todos; solo el líder/cabeza/admin los editan', async () => {
  const pos = (await one(`select id from public.positions where code = '2'`)).id;
  assert.equal(await as(U.vol1, () => count('position_media')), 4);
  assert.equal(await as(U.volSuba, () => count('position_media')), 0);       // otra sede
  assert.equal(await as(U.liderNogal, () => count('position_media')), 0);
  const add = (uid) => as(uid, () => db.query(`insert into public.position_media (position_id, kind, url) values ($1, 'link', 'https://x.com/y')`, [pos]));
  await denied(() => add(U.vol1), /row-level security/);
  await denied(() => add(U.coord1), /row-level security/);
  await denied(() => add(U.liderNogal), /row-level security/);
  await add(U.liderCas);
  await add(U.cabeza);
  assert.equal(await as(U.vol1, async () => (await db.query(`delete from public.position_media where position_id = $1`, [pos])).affectedRows), 0);
  assert.equal(await as(U.liderCas, async () => (await db.query(`delete from public.position_media where kind = 'link'`)).affectedRows), 3);   // el original + los dos agregados
});

test('fase 2 · flujos: visibles en su sede, editables por el líder; los pasos deben ser de la misma sede', async () => {
  const flow = (await as(U.liderCas, () => db.query(`insert into public.flows (site_id, name, description) values ($1, 'Cuando se llena el Auditorio principal', 'Orden de overflow') returning id`, [U.sCas]))).rows[0].id;
  const locs = Object.fromEntries((await rows(`select l.name || '@' || s.slug as k, l.id from public.locations l join public.sites s on s.id = l.site_id`)).map((r) => [r.k, r.id]));
  const step = (uid, order, loc) => as(uid, () => db.query(`insert into public.flow_steps (flow_id, step_order, location_id, title, instructions) values ($1, $2, $3, $4, 'Dirigir a la gente')`, [flow, order, loc, `Paso ${order}`]));
  await step(U.liderCas, 1, locs['Overflow piso 4@castellana']);
  await step(U.liderCas, 2, locs['Overflow piso 5@castellana']);
  await step(U.liderCas, 3, locs['Teatro@castellana']);
  await denied(() => step(U.liderCas, 4, locs['Overflow@suba']), /misma sede/);                    // espacio de otra sede
  await denied(() => step(U.liderCas, 2, locs['Salones@castellana']), /unique|duplicate/);          // orden repetido
  await denied(() => step(U.vol1, 9, locs['Salones@castellana']), /row-level security/);
  await denied(() => as(U.liderNogal, () => db.query(`insert into public.flows (site_id, name) values ($1, 'x')`, [U.sCas])), /row-level security/);
  // visibilidad
  assert.equal(await as(U.vol1, () => count('flow_steps')), 3);
  assert.equal(await as(U.volSuba, () => count('flows')), 0);
  assert.equal(await as(U.cabeza, () => count('flow_steps')), 3);
  // reordenar intercambiando dos pasos en una sola sentencia (restricción diferible)
  await as(U.liderCas, () => db.query(`update public.flow_steps set step_order = case step_order when 1 then 2 when 2 then 1 else step_order end where flow_id = $1 and step_order in (1, 2)`, [flow]));
  assert.deepEqual((await rows(`select step_order from public.flow_steps where flow_id = $1 order by step_order`, [flow])).map((r) => r.step_order), [1, 2, 3]);
  // si se borra un espacio, el paso se conserva sin espacio
  await db.query(`delete from public.locations where id = $1`, [locs['Teatro@castellana']]);
  assert.equal(await count('flow_steps', `location_id is null`), 1);
});

test('fase 2 · storage de fotos de posiciones y updated_at de mapas', async () => {
  await db.exec(`insert into storage.objects (bucket_id, name) values ('position-media', 'castellana/p1/a.jpg'), ('position-media', 'suba/p1/b.jpg')`);
  const names = (uid) => as(uid, async () => (await rows(`select name from storage.objects where bucket_id = 'position-media'`)).map((r) => r.name));
  assert.deepEqual(await names(U.vol1), ['castellana/p1/a.jpg']);
  assert.deepEqual(await names(U.volSuba), ['suba/p1/b.jpg']);
  await as(U.liderCas, () => db.query(`insert into storage.objects (bucket_id, name) values ('position-media', 'castellana/p1/c.jpg')`));
  await denied(() => as(U.vol1, () => db.query(`insert into storage.objects (bucket_id, name) values ('position-media', 'castellana/p1/d.jpg')`)), /row-level security/);
  await denied(() => as(U.liderCas, () => db.query(`insert into storage.objects (bucket_id, name) values ('position-media', 'suba/p1/e.jpg')`)), /row-level security/);
  const before = (await one(`select updated_at from public.maps where zone_id is null and image_path like 'castellana/%'`)).updated_at;
  await new Promise((r) => setTimeout(r, 15));
  await as(U.liderCas, () => db.query(`update public.maps set image_version = image_version + 1 where zone_id is null and image_path like 'castellana/%'`));
  assert.ok((await one(`select updated_at from public.maps where zone_id is null and image_path like 'castellana/%'`)).updated_at > before);
});

// ───────────── Endurecimiento (cierre de fases 1 y 2) ─────────────
// Estas dos pruebas también protegen las migraciones futuras: fallan si una función nueva queda abierta
// a visitantes sin sesión o si una clave foránea queda sin índice.
test('endurecimiento · ninguna función de public es ejecutable por anon o PUBLIC; solo las auxiliares por authenticated', async () => {
  const fns = await rows(`
    select p.proname, p.prorettype = 'trigger'::regtype as is_trigger, p.prosecdef,
           has_function_privilege('anon', p.oid, 'execute') as anon_ok,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           coalesce(p.proacl::text, '') ~ '(^|,)=X' or p.proacl is null as public_ok,
           (select count(*) from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as sp
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'`);
  assert.ok(fns.length >= 20, `se esperaban ≥20 funciones, hay ${fns.length}`);
  for (const f of fns) {
    assert.equal(f.anon_ok, false, `${f.proname}: la ejecuta anon`);
    assert.equal(f.public_ok, false, `${f.proname}: la ejecuta PUBLIC`);
    if (f.proname === 'hook_before_user_created' || f.is_trigger) assert.equal(f.auth_ok, false, `${f.proname}: no debe ejecutarla authenticated`);
    else assert.equal(f.auth_ok, true, `${f.proname}: authenticated la necesita para las políticas RLS`);
    assert.ok(Number(f.sp) >= 1, `${f.proname}: sin search_path fijo`);
  }
});

test('endurecimiento · las políticas siguen funcionando y los triggers siguen disparando sin permiso de ejecución', async () => {
  // anon no puede llamar las funciones por la API
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select public.site_id_by_slug('castellana')`), /permission denied/); } finally { await db.exec(`reset role`); }
  // un usuario con sesión sí (lo usan las políticas)
  assert.ok(await as(U.vol1, async () => (await one(`select public.site_id_by_slug('castellana') as id`)).id));
  await denied(() => as(U.vol1, () => db.query(`select public.handle_new_user()`)), /permission denied|trigger functions/);
  // el trigger de alta funciona aunque quien inserta en auth.users no pueda ejecutar la función
  await db.exec(`create role signup_probe nologin; grant usage on schema auth to signup_probe; grant insert, select on auth.users to signup_probe;
    insert into public.invitations (email, is_admin) values ('probe@x.com', false);`);
  await db.exec(`set role signup_probe`);
  try { await db.query(`insert into auth.users (email) values ('probe@x.com')`); } finally { await db.exec(`reset role`); }
  assert.equal(await count('profile_private', `email = 'probe@x.com'`), 1);
});

test('endurecimiento · toda clave foránea tiene un índice que la cubra', async () => {
  const bare = await rows(`
    select c.conrelid::regclass::text || ' → ' || pg_get_constraintdef(c.oid) as fk
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)`);
  assert.deepEqual(bare.map((r) => r.fk), []);
});

// ───────────── Fase 3 · Personas y grupos ─────────────
const emailsSeenBy = (uid) => as(uid, async () => (await rows(`select email from public.profile_private order by email`)).map((r) => r.email));

test('fase 3 · privacidad: cada quien ve su propio correo y solo los de las personas que administra', async () => {
  // Grupo 1 de Castellana: coord1, coord2 (coordinadores), sup1, sup2 (supervisores; sup2 fue eliminado antes), vol1.
  // Voluntario y supervisor: solo el suyo.
  assert.deepEqual(await emailsSeenBy(U.vol1), ['vol1@x.com']);
  assert.deepEqual(await emailsSeenBy(U.sup1), ['sup1@x.com']);
  assert.deepEqual(await emailsSeenBy(U.volSuba), ['volsuba@x.com']);
  // Coordinador: el suyo + supervisores y voluntarios de su grupo; NO el del otro coordinador ni los de otros grupos.
  const coord = await emailsSeenBy(U.coord1);
  assert.ok(coord.includes('coord1@x.com') && coord.includes('sup1@x.com') && coord.includes('vol1@x.com'));
  assert.ok(!coord.includes('coord2@x.com'), 'un coordinador no ve el correo de otro coordinador');
  assert.ok(!coord.includes('volsuba@x.com') && !coord.includes('lider.cas@x.com'));
  // Líder de sede: su sede completa (incluidos coordinadores), no otras sedes ni otros líderes.
  const lider = await emailsSeenBy(U.liderCas);
  assert.ok(['coord1@x.com', 'coord2@x.com', 'sup1@x.com', 'vol1@x.com', 'lider.cas@x.com'].every((e) => lider.includes(e)));
  assert.ok(!lider.includes('volsuba@x.com') && !lider.includes('lider.nogal@x.com'));
  // Cabeza y admin: todos.
  assert.equal((await emailsSeenBy(U.cabeza)).length, await count('profile_private'));
  assert.equal((await emailsSeenBy(U.admin)).length, await count('profile_private'));
  // Pero los nombres de su grupo sí los ven todos (para "Mi grupo").
  const names = await as(U.vol1, async () => (await rows(`select full_name from public.profiles order by full_name`)).map((r) => r.full_name));
  const groupNames = (await rows(`select p.full_name from public.memberships m join public.profiles p on p.user_id = m.user_id where m.group_id = $1 order by 1`, [U.gCas1])).map((r) => r.full_name);
  assert.ok(groupNames.length >= 3);
  assert.deepEqual(names, groupNames, 've los nombres de su grupo y de nadie más');
  // Nadie puede escribir en la tabla privada; anon no la ve.
  await denied(() => as(U.admin, () => db.query(`update public.profile_private set email = 'x@y.com' where user_id = $1`, [U.vol1])), /permission denied/);
  await denied(() => as(U.liderCas, () => db.query(`insert into public.profile_private (user_id, email) values ($1, 'z@z.com')`, [U.vol1])), /permission denied/);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select * from public.profile_private`), /permission denied/); } finally { await db.exec(`reset role`); }
  // Ninguna otra tabla expone correos: invitaciones solo para quien administra el grupo.
  assert.equal(await as(U.vol1, () => count('invitations')), 0);
  assert.equal(await as(U.sup1, () => count('invitations')), 0);
});

test('fase 3 · mover y cambiar de rol: coordinador solo dentro de su grupo; líder en su sede; admin en cualquiera', async () => {
  const move = (uid, who, gid, role) => as(uid, async () => (await db.query(`update public.memberships set group_id = $2, role = $3 where user_id = $1`, [who, gid, role])).affectedRows);
  // Coordinador: cambia supervisor ↔ voluntario en su grupo, pero no a coordinador ni a otro grupo.
  assert.equal(await move(U.coord1, U.sup1, U.gCas1, 'voluntario'), 1);
  assert.equal(await move(U.coord1, U.sup1, U.gCas1, 'supervisor'), 1);
  await denied(() => move(U.coord1, U.sup1, U.gCas2, 'supervisor'), /row-level security/);
  await denied(() => move(U.coord1, U.vol1, U.gCas1, 'coordinador'), /row-level security|2 coordinadores/);
  // Supervisor y voluntario no cambian nada.
  assert.equal(await move(U.sup1, U.vol1, U.gCas1, 'supervisor'), 0);
  // Líder de Castellana: mueve a un voluntario a otro grupo de su sede (como supervisor), no a otra sede.
  assert.equal(await move(U.liderCas, U.vol1, U.gCas2, 'supervisor'), 1);
  await denied(() => move(U.liderCas, U.vol1, U.gSuba1, 'voluntario'), /row-level security/);
  // Admin: entre sedes.
  assert.equal(await move(U.admin, U.vol1, U.gSuba1, 'voluntario'), 1);
  assert.equal((await one(`select g.id = $2 as ok from public.memberships m join public.groups g on g.id = m.group_id where m.user_id = $1`, [U.vol1, U.gSuba1])).ok, true);
  // …y vuelve (el resto de pruebas asume vol1 en Castellana · Grupo 1).
  assert.equal(await move(U.admin, U.vol1, U.gCas1, 'voluntario'), 1);
});

test('fase 3 · eliminar de la aplicación: quién puede, y que no pueda volver a entrar', async () => {
  const del = (uid, who) => as(uid, () => db.query(`select public.delete_person($1)`, [who]));
  // Altas nuevas para eliminar.
  await as(U.liderCas, async () => {
    await db.query(`insert into public.invitations (email, group_id, group_role) values ('borrar1@x.com', $1, 'voluntario'), ('borrar2@x.com', $1, 'supervisor'), ('borrar3@x.com', $1, 'voluntario')`, [U.gCas1]);
  });
  await signup('borrar1', 'borrar1@x.com'); await signup('borrar2', 'borrar2@x.com'); await signup('borrar3', 'borrar3@x.com');
  // Sin permiso: voluntario, supervisor, a uno mismo, otra sede, coordinador a otro coordinador, líder de otra sede.
  await denied(() => del(U.vol1, U.borrar1), /No tienes permiso/);
  await denied(() => del(U.sup1, U.borrar1), /No tienes permiso/);
  await denied(() => del(U.borrar1, U.borrar1), /No tienes permiso/);
  await denied(() => del(U.liderNogal, U.borrar1), /No tienes permiso/);
  await denied(() => del(U.coord1, U.coord2), /No tienes permiso/);
  await denied(() => del(U.coord1, U.liderCas), /No tienes permiso/);
  await denied(() => del(U.liderCas, U.liderNogal), /No tienes permiso/);
  await denied(() => del(U.liderCas, U.cabeza), /No tienes permiso/);
  await denied(() => del(U.cabeza, U.admin), /No tienes permiso/);
  await denied(() => del(U.admin, U.admin), /No tienes permiso/);   // ni a sí mismo
  await denied(() => del(U.admin, '00000000-0000-4000-8000-0000000000ff'), /no existe/);
  assert.equal(await count('profiles', `user_id = '${U.borrar1}'`), 1);
  // Con permiso: coordinador (supervisor/voluntario de su grupo), líder (su sede), admin.
  await del(U.coord1, U.borrar1);
  await del(U.liderCas, U.borrar2);
  await del(U.admin, U.borrar3);
  for (const n of ['borrar1', 'borrar2', 'borrar3']) {
    assert.equal(await count('profiles', `user_id = '${U[n]}'`), 0, `${n}: perfil`);
    assert.equal(await count('profile_private', `user_id = '${U[n]}'`), 0, `${n}: correo`);
    assert.equal(await count('memberships', `user_id = '${U[n]}'`), 0, `${n}: grupo`);
    assert.equal(Number((await one(`select count(*)::int n from auth.users where id = $1`, [U[n]])).n), 0, `${n}: cuenta`);
  }
  // Sin invitación, no puede volver a entrar.
  assert.equal(await count('invitations', `email like 'borrar%@x.com'`), 0);
  await denied(() => signup('borrar1b', 'borrar1@x.com'), /no autorizado/i);
  // …pero si se le vuelve a invitar, entra de nuevo normalmente.
  await as(U.coord1, () => db.query(`insert into public.invitations (email, group_id, group_role) values ('borrar1@x.com', $1, 'voluntario')`, [U.gCas1]));
  await signup('borrar1c', 'borrar1@x.com');
  assert.equal(await count('memberships', `user_id = '${U.borrar1c}'`), 1);
  // Líder: lo elimina la cabeza o el admin, no otro líder.
  await del(U.cabeza, U.liderNogal);
  assert.equal(await count('site_leaders', `user_id = '${U.liderNogal}'`), 0);
  // Un segundo administrador sí puede eliminar al primero (siempre queda quien elimina); el primero no puede eliminarse.
  await db.exec(`insert into public.invitations (email, is_admin) values ('admin2@x.com', true)`);
  await signup('admin2', 'admin2@x.com');
  await del(U.admin, U.admin2);
  assert.equal(await count('profiles', `user_id = '${U.admin2}'`), 0);
  assert.equal(await count('profiles', `is_admin`), 1);
});

test('fase 3 · horarios y grupos: el líder administra los de su sede; no se borra un grupo con integrantes', async () => {
  const slotIn = (uid, siteId, day, shift) => as(uid, () => db.query(`insert into public.service_slots (site_id, day, shift) values ($1, $2, $3) returning id`, [siteId, day, shift]));
  const { rows: [slot] } = await slotIn(U.liderCas, U.sCas, 'domingo', 'am');
  await denied(() => slotIn(U.liderNogal, U.sCas, 'domingo', 'pm'), /row-level security/);
  await denied(() => slotIn(U.vol1, U.sCas, 'domingo', 'pm'), /row-level security/);
  await denied(() => slotIn(U.coord1, U.sCas, 'domingo', 'pm'), /row-level security/);
  const grp = (uid, name) => as(uid, () => db.query(`insert into public.groups (service_slot_id, name) values ($1, $2) returning id`, [slot.id, name]));
  const { rows: [g] } = await grp(U.liderCas, 'Grupo Nuevo');
  await denied(() => grp(U.coord1, 'x'), /row-level security/);
  // El coordinador y el voluntario ven los grupos que les corresponden, no los demás.
  assert.equal(await as(U.vol1, () => count('groups', `id = '${g.id}'`)), 0);
  assert.equal(await as(U.cabeza, () => count('groups', `id = '${g.id}'`)), 1);
  // Un grupo con integrantes no se borra (ni a través del horario ni de la sede); uno vacío sí.
  await denied(() => as(U.liderCas, () => db.query(`delete from public.groups where id = $1`, [U.gCas1])), /tiene integrantes/);
  await denied(() => as(U.admin, () => db.query(`delete from public.service_slots where id = (select service_slot_id from public.groups where id = $1)`, [U.gCas1])), /tiene integrantes/);
  await as(U.liderCas, () => db.query(`delete from public.groups where id = $1`, [g.id]));
  await as(U.liderCas, () => db.query(`delete from public.service_slots where id = $1`, [slot.id]));
  assert.equal(await count('groups', `id = '${g.id}'`), 0);
});

// ───────────── Fase 4 · Anuncios ─────────────
const ann = (uid, title, o = {}) =>
  as(uid, () => db.query(
    `insert into public.announcements (title, site_id, day, group_id, starts_at, ends_at, pinned)
     values ($1, $2, $3, $4, coalesce($5::timestamptz, now()), $6, $7) returning id`,
    [title, o.site ?? null, o.day ?? null, o.group ?? null, o.starts ?? null, o.ends ?? null, o.pinned ?? false]));
const titlesSeenBy = (uid) => as(uid, async () => (await rows(`select title from public.announcements order by title`)).map((r) => r.title));
const DAY_MS = 86400000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

test('fase 4 · anuncios: quién ve cada alcance (iglesia, sede, sede+día, día, grupo) y la vigencia', async () => {
  // Actores: líder de Nogal, y un voluntario de Castellana que sirve el domingo (otro horario de la misma sede).
  await as(U.admin, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.nogal2@x.com', $1)`, [[U.sNogal]]));
  await signup('liderNogal2', 'lider.nogal2@x.com');
  U.sSuba = (await one(`select id from public.sites where slug = 'suba'`)).id;
  const slotDom = (await one(`insert into public.service_slots (site_id, day, shift) values ($1, 'domingo', 'am') returning id`, [U.sCas])).id;
  U.gDom = (await one(`insert into public.groups (service_slot_id, name) values ($1, 'Grupo Dom') returning id`, [slotDom])).id;
  await as(U.liderCas, () => db.query(`insert into public.invitations (email, group_id, group_role) values ('vol.dom@x.com', $1, 'voluntario')`, [U.gDom]));
  await signup('volDom', 'vol.dom@x.com');

  // Un anuncio de cada alcance (los publica el administrador)
  const A = U.admin;
  await ann(A, 'all');
  await ann(A, 'cas', { site: U.sCas });
  await ann(A, 'cas-sab', { site: U.sCas, day: 'sabado' });
  await ann(A, 'cas-dom', { site: U.sCas, day: 'domingo' });
  await ann(A, 'suba', { site: U.sSuba });
  await ann(A, 'day-sab', { day: 'sabado' });
  await ann(A, 'g1', { group: U.gCas1 });
  await ann(A, 'g2', { group: U.gCas2 });
  await ann(A, 'cas-future', { site: U.sCas, starts: iso(1) });
  await ann(A, 'cas-expired', { site: U.sCas, starts: iso(-3), ends: iso(-1) });
  await ann(A, 'g1-future', { group: U.gCas1, starts: iso(2) });

  // Quien sirve el sábado en Castellana (grupo 1): iglesia, sede, sede+sábado, sábado y su grupo. Nada de otros días, sedes ni grupos.
  const sabado = ['all', 'cas', 'cas-sab', 'day-sab', 'g1'];
  assert.deepEqual(await titlesSeenBy(U.vol1), sabado);
  assert.deepEqual(await titlesSeenBy(U.sup1), sabado);
  // Voluntario de Castellana que sirve el domingo
  assert.deepEqual(await titlesSeenBy(U.volDom), ['all', 'cas', 'cas-dom']);
  // Voluntario de Suba (domingo): iglesia y su sede; no el "sábado" de todas las sedes ni lo de Castellana
  assert.deepEqual(await titlesSeenBy(U.volSuba), ['all', 'suba']);
  // Coordinador: lo de su alcance + lo programado de SU grupo (lo administra), pero no lo programado de la sede
  assert.deepEqual(await titlesSeenBy(U.coord1), [...sabado, 'g1-future'].sort());
  // Líder de Castellana: toda su sede (también programados, vencidos y de sus grupos) + iglesia + los de "día" de todas las sedes; no Suba
  assert.deepEqual(await titlesSeenBy(U.liderCas), ['all', 'cas', 'cas-dom', 'cas-expired', 'cas-future', 'cas-sab', 'day-sab', 'g1', 'g1-future', 'g2']);
  // Líder de Nogal: iglesia y lo general por día; nada de Castellana ni Suba
  assert.deepEqual(await titlesSeenBy(U.liderNogal2), ['all', 'day-sab']);
  // Cabeza y admin: todo
  assert.equal((await titlesSeenBy(U.cabeza)).length, 11);
  assert.equal((await titlesSeenBy(U.admin)).length, 11);
  // Una sesión sin cuenta (persona eliminada con la sesión aún vigente) no ve ni lo de toda la iglesia
  assert.deepEqual(await titlesSeenBy('00000000-0000-4000-8000-0000000000aa'), []);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select * from public.announcements`), /permission denied/); } finally { await db.exec(`reset role`); }
});

test('fase 4 · anuncios: quién puede publicar, editar y eliminar', async () => {
  // Cabeza y admin: cualquier alcance (incluida toda la iglesia y "un día en todas las sedes")
  await ann(U.cabeza, 'p-cabeza-iglesia');
  await ann(U.cabeza, 'p-cabeza-dia', { day: 'domingo' });
  // Líder de Castellana: su sede, sede+día y los grupos de su sede; no la iglesia, otras sedes, un día suelto ni grupos ajenos
  await ann(U.liderCas, 'p-lider-sede', { site: U.sCas });
  await ann(U.liderCas, 'p-lider-sede-dia', { site: U.sCas, day: 'sabado' });
  await ann(U.liderCas, 'p-lider-grupo', { group: U.gCas2 });
  await denied(() => ann(U.liderCas, 'x', {}), /row-level security/);
  await denied(() => ann(U.liderCas, 'x', { site: U.sSuba }), /row-level security/);
  await denied(() => ann(U.liderCas, 'x', { day: 'sabado' }), /row-level security/);
  await denied(() => ann(U.liderCas, 'x', { group: U.gSuba1 }), /row-level security/);
  await denied(() => ann(U.liderCas, 'x', { group: U.gSuba1, site: U.sCas }), /row-level security/);   // declara SU sede pero apunta a un grupo de otra
  // Declarar otra sede no sirve de nada: la de un anuncio de grupo es la del grupo
  const spoof = (await ann(U.liderCas, 'p-lider-grupo-sede-falsa', { group: U.gCas2, site: U.sSuba })).rows[0].id;
  assert.equal((await one(`select site_id = $2 as ok from public.announcements where id = $1`, [spoof, U.sCas])).ok, true);
  await denied(() => ann(U.liderNogal2, 'x', { site: U.sCas }), /row-level security/);
  await ann(U.liderNogal2, 'p-nogal', { site: U.sNogal });
  // Coordinador: solo su grupo
  await ann(U.coord1, 'p-coord-grupo', { group: U.gCas1 });
  await denied(() => ann(U.coord1, 'x', { group: U.gCas2 }), /row-level security/);
  await denied(() => ann(U.coord1, 'x', { site: U.sCas }), /row-level security/);
  await denied(() => ann(U.coord1, 'x', {}), /row-level security/);
  // Supervisor, voluntarios: nada
  for (const u of [U.sup1, U.vol1, U.volDom, U.volSuba]) await denied(() => ann(u, 'x', { group: U.gCas1 }), /row-level security/);

  // Datos válidos: grupo + día no tiene sentido; la vigencia debe tener sentido; título y cuerpo con límite
  await denied(() => as(U.admin, () => db.query(`insert into public.announcements (title, group_id, day) values ('x', $1, 'sabado')`, [U.gCas1])), /check/);
  await denied(() => ann(U.admin, 'x', { starts: iso(2), ends: iso(1) }), /check/);
  await denied(() => ann(U.admin, '   '), /check/);
  await denied(() => as(U.admin, () => db.query(`insert into public.announcements (title, body) values ('x', repeat('a', 5001))`)), /check/);

  // El autor sale de la sesión (no se puede suplantar) y queda con su nombre y rol de ese momento
  const forged = (await as(U.liderCas, () => db.query(`insert into public.announcements (title, site_id, author_id, author_name) values ('p-falso', $1, $2, 'Otra Persona') returning id, author_id`, [U.sCas, U.admin]))).rows[0];
  assert.equal(forged.author_id, U.liderCas);
  const who = async (title) => (await one(`select author_name, author_role from public.announcements where title = $1`, [title]));
  assert.deepEqual(await who('p-falso'), { author_name: 'liderCas', author_role: 'Líder de Castellana' });
  assert.deepEqual(await who('p-coord-grupo'), { author_name: 'coord1', author_role: 'Coordinador' });
  assert.deepEqual(await who('p-cabeza-iglesia'), { author_name: 'cabeza', author_role: 'Cabeza de ministerio' });
  assert.equal((await who('all')).author_role, 'Administrador');

  // Editar: el coordinador edita lo de su grupo (también lo que publicó otra persona); no lo de la sede; no lo mueve a otro grupo
  const upd = (uid, id, set, args = []) => as(uid, async () => (await db.query(`update public.announcements set ${set} where id = $1`, [id, ...args])).affectedRows);
  const adminG1 = (await one(`select id from public.announcements where title = 'g1'`)).id;
  const casId = (await one(`select id from public.announcements where title = 'cas'`)).id;
  assert.equal(await upd(U.coord1, adminG1, `title = 'g1 editado', pinned = true`), 1);
  assert.equal(await upd(U.coord1, casId, `title = 'hack'`), 0);
  await denied(() => upd(U.coord1, adminG1, `group_id = $2`, [U.gCas2]), /row-level security/);
  await denied(() => upd(U.coord1, adminG1, `group_id = null`), /row-level security/);
  assert.equal(await upd(U.vol1, adminG1, `title = 'hack'`), 0);
  // El autor y la fecha de creación no cambian al editar; updated_at sí
  const before = await one(`select author_id, author_name, created_at, updated_at from public.announcements where id = $1`, [adminG1]);
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(await upd(U.coord1, adminG1, `author_id = $2, author_name = 'Otro', created_at = now() - interval '9 days', body = 'nuevo texto'`, [U.vol1]), 1);
  const after = await one(`select author_id, author_name, created_at, updated_at from public.announcements where id = $1`, [adminG1]);
  assert.equal(after.author_id, before.author_id); assert.equal(after.author_name, before.author_name);
  assert.equal(+after.created_at, +before.created_at); assert.ok(after.updated_at > before.updated_at);

  // Eliminar
  const del = (uid, id) => as(uid, async () => (await db.query(`delete from public.announcements where id = $1`, [id])).affectedRows);
  assert.equal(await del(U.vol1, adminG1), 0);
  assert.equal(await del(U.coord1, casId), 0);
  assert.equal(await del(U.coord1, adminG1), 1);
  assert.equal(await del(U.liderCas, casId), 1);
});

test('fase 4 · anuncios: enlaces seguros que siguen la visibilidad del anuncio; el grupo se lleva sus anuncios', async () => {
  const id = (await ann(U.coord1, 'con-enlaces', { group: U.gCas1 })).rows[0].id;
  const link = (uid, label, url) => as(uid, () => db.query(`insert into public.announcement_links (announcement_id, label, url) values ($1, $2, $3)`, [id, label, url]));
  await link(U.coord1, 'Programa del culto', 'https://docs.google.com/presentation/d/abc');
  await link(U.liderCas, 'Mapa', 'https://maps.app.goo.gl/xyz');
  await denied(() => link(U.coord1, 'x', 'javascript:alert(1)'), /check/);
  await denied(() => link(U.coord1, 'x', 'http://sin-https.com'), /check/);
  await denied(() => link(U.coord1, 'x', 'https://con espacio.com'), /check/);
  await denied(() => link(U.coord1, '  ', 'https://ok.com'), /check/);
  await denied(() => link(U.vol1, 'x', 'https://ok.com'), /row-level security/);
  await link(U.coord2, 'Enlace del otro coordinador', 'https://ok.com');               // el otro coordinador del mismo grupo también puede
  await denied(() => link(U.liderNogal2, 'x', 'https://ok.com'), /row-level security/);   // quien ni ve el anuncio, no le agrega enlaces

  // Los enlaces se ven si se ve el anuncio (su grupo), y solo quien lo administra los quita
  assert.equal(await as(U.vol1, () => count('announcement_links')), 3);
  assert.equal(await as(U.volSuba, () => count('announcement_links')), 0);
  assert.equal(await as(U.volDom, () => count('announcement_links')), 0);
  assert.equal(await as(U.vol1, async () => (await db.query(`delete from public.announcement_links where announcement_id = $1`, [id])).affectedRows), 0);
  assert.equal(await as(U.coord1, async () => (await db.query(`delete from public.announcement_links where label = 'Mapa'`)).affectedRows), 1);
  // Si el anuncio se elimina, se van sus enlaces
  await as(U.coord1, () => db.query(`delete from public.announcements where id = $1`, [id]));
  assert.equal(await count('announcement_links'), 0);

  // Si se elimina un grupo (vacío), se van sus anuncios
  const slotDom = (await one(`select id from public.service_slots where site_id = $1 and day = 'domingo'`, [U.sCas])).id;
  const tmp = (await as(U.liderCas, () => db.query(`insert into public.groups (service_slot_id, name) values ($1, 'Temporal') returning id`, [slotDom]))).rows[0].id;
  await ann(U.liderCas, 'del-grupo-temporal', { group: tmp });
  assert.equal(await count('announcements', `title = 'del-grupo-temporal'`), 1);
  await as(U.liderCas, () => db.query(`delete from public.groups where id = $1`, [tmp]));
  assert.equal(await count('announcements', `title = 'del-grupo-temporal'`), 0);
});
