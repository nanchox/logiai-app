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
    // Funciones que solo ejecuta el servidor (service_role): ninguna persona, ni con sesión.
    const SERVER_ONLY = ['support_request_audience', 'pending_counts_audience', 'claim_notification'];
    if (SERVER_ONLY.includes(f.proname)) {
      assert.equal(f.auth_ok, false, `${f.proname}: solo el servidor la ejecuta`);
      assert.equal((await one(`select has_function_privilege('service_role', $1::regproc, 'execute') ok`, [f.proname])).ok, true, `${f.proname}: el servidor sí`);
    } else if (f.proname === 'hook_before_user_created' || f.is_trigger) assert.equal(f.auth_ok, false, `${f.proname}: no debe ejecutarla authenticated`);
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

// ───────────── Fase 5 · Rotación y servicio ─────────────
const gen = (uid, slot, from, until, first = null) =>
  as(uid, async () => (await one(`select public.generate_service_events($1, $2, $3, $4) r`, [slot, from, until, first])).r);
const dayGroups = async (slot, order = 'service_date') =>
  (await rows(`select e.service_date::text d, g.name g, e.status from public.service_events e left join public.groups g on g.id = e.group_id where e.slot_id = $1 order by ${order}`, [slot]));
const names = (rs) => rs.map((r) => r.g);

test('fase 5 · rotación: secuencia semanal en orden, idempotente, y continúa al ampliar el rango', async () => {
  U.sCamp = (await one(`select id from public.sites where slug = 'campestre'`)).id;
  U.slotCamp = (await one(`insert into public.service_slots (site_id, day, shift) values ($1, 'domingo', 'unica') returning id`, [U.sCamp])).id;
  for (const n of ['R1', 'R2', 'R3', 'R4']) await db.query(`insert into public.groups (service_slot_id, name) values ($1, $2)`, [U.slotCamp, n]);
  assert.deepEqual((await rows(`select rotation_order o from public.groups where service_slot_id = $1 order by 1`, [U.slotCamp])).map((r) => r.o), [1, 2, 3, 4]);
  await as(U.admin, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.camp@x.com', $1)`, [[U.sCamp]]));
  await signup('liderCamp', 'lider.camp@x.com');
  const gid = async (n) => (await one(`select id from public.groups where service_slot_id = $1 and name = $2`, [U.slotCamp, n])).id;
  for (const n of ['R1', 'R2', 'R3', 'R4']) U['g' + n] = await gid(n);

  // Quien no administra la sede no genera
  await denied(() => gen(U.liderNogal, U.slotCamp, '2030-01-01', '2030-02-24'), /No tienes permiso/);
  await denied(() => gen(U.coord1, U.slotCamp, '2030-01-01', '2030-02-24'), /No tienes permiso/);
  await denied(() => gen(U.liderCamp, U.slotCamp, '2030-02-24', '2030-01-01'), /posterior/);
  await denied(() => gen(U.liderCamp, U.slotCamp, '2030-01-01', '2031-12-31'), /400 días/);

  const r = await gen(U.liderCamp, U.slotCamp, '2030-01-01', '2030-02-24');
  assert.deepEqual(r, { created: 8, updated: 0, protected: 0, kept: 0 });
  let ev = await dayGroups(U.slotCamp);
  assert.equal(ev[0].d, '2030-01-06');                                  // el primer domingo
  assert.deepEqual(names(ev), ['R1', 'R2', 'R3', 'R4', 'R1', 'R2', 'R3', 'R4']);
  // Idempotente
  assert.deepEqual(await gen(U.liderCamp, U.slotCamp, '2030-01-01', '2030-02-24'), { created: 0, updated: 0, protected: 0, kept: 0 });
  // Ampliar continúa la secuencia (no reinicia)
  assert.deepEqual(await gen(U.cabeza, U.slotCamp, '2030-02-25', '2030-03-17'), { created: 3, updated: 0, protected: 0, kept: 0 });
  assert.deepEqual(names(await dayGroups(U.slotCamp)).slice(8), ['R1', 'R2', 'R3']);
  // El día de la semana del horario manda: el miércoles de Nogal cae en miércoles
  const slotNog = (await one(`select id from public.service_slots where site_id = $1 and day = 'miercoles'`, [U.sNogal])).id;
  await gen(U.liderNogal2, slotNog, '2030-01-01', '2030-01-10');
  assert.deepEqual((await rows(`select service_date::text d from public.service_events where slot_id = $1 order by 1`, [slotNog])).map((r) => r.d), ['2030-01-02', '2030-01-09']);
  // Sedes independientes: la de Campestre no cambió
  assert.equal(await count('service_events', `slot_id = '${U.slotCamp}'`), 11);
});

test('fase 5 · cancelaciones: la fecha cancelada consume el turno; alcances y permisos', async () => {
  const cancel = (uid, d, o = {}) => as(uid, () => db.query(`insert into public.service_cancellations (service_date, site_id, slot_id, reason) values ($1, $2, $3, $4) returning id`, [d, o.site ?? null, o.slot ?? null, o.reason ?? null]));
  // Cancelar la 3.ª fecha (2030-01-20, le tocaba R3): ese turno se pierde y el 27 sigue sirviendo R4
  const c = (await cancel(U.liderCamp, '2030-01-20', { site: U.sCamp, reason: 'Retiro' })).rows[0].id;
  let ev = await dayGroups(U.slotCamp);
  assert.deepEqual(ev.slice(0, 5).map((e) => `${e.d}:${e.g}:${e.status}`), [
    '2030-01-06:R1:programado', '2030-01-13:R2:programado', '2030-01-20:R3:cancelado', '2030-01-27:R4:programado', '2030-02-03:R1:programado']);
  assert.equal((await one(`select cancel_reason r from public.service_events where slot_id = $1 and service_date = '2030-01-20'`, [U.slotCamp])).r, 'Retiro');
  // Regenerar no mueve a nadie: la cancelada mantiene su turno
  assert.deepEqual(await gen(U.liderCamp, U.slotCamp, '2030-01-01', '2030-03-17'), { created: 0, updated: 0, protected: 0, kept: 0 });
  // Ver cancelaciones: líder de la sede sí, el de otra sede no; el coordinador solo mira (no ve la tabla de gestión)
  assert.equal(await as(U.liderCamp, () => count('service_cancellations')), 1);
  assert.equal(await as(U.liderNogal, () => count('service_cancellations')), 0);
  // Quitar la cancelación restablece el servicio
  await as(U.liderCamp, () => db.query(`delete from public.service_cancellations where id = $1`, [c]));
  assert.equal((await one(`select status s from public.service_events where slot_id = $1 and service_date = '2030-01-20'`, [U.slotCamp])).s, 'programado');
  assert.equal((await one(`select cancel_reason r from public.service_events where slot_id = $1 and service_date = '2030-01-20'`, [U.slotCamp])).r, null);

  // Permisos: el líder de otra sede no cancela aquí; "todas las sedes" solo cabeza y admin
  await denied(() => cancel(U.liderNogal, '2030-01-20', { site: U.sCamp }), /row-level security/);
  await denied(() => cancel(U.liderCamp, '2030-01-20', {}), /row-level security/);
  await denied(() => cancel(U.coord1, '2030-01-20', { site: U.sCas }), /row-level security/);
  await denied(() => cancel(U.vol1, '2030-01-20', { site: U.sCas }), /row-level security/);
  // Un horario concreto de la sede y todas las sedes
  await cancel(U.liderCamp, '2030-01-13', { slot: U.slotCamp, reason: 'Solo este horario' });
  const all = (await cancel(U.cabeza, '2030-02-03', { reason: 'Festivo' })).rows[0].id;
  const st = async (slot, d) => (await one(`select status s, cancel_reason r from public.service_events where slot_id = $1 and service_date = $2`, [slot, d]));
  assert.deepEqual(await st(U.slotCamp, '2030-01-13'), { s: 'cancelado', r: 'Solo este horario' });
  assert.deepEqual(await st(U.slotCamp, '2030-02-03'), { s: 'cancelado', r: 'Festivo' });
  // Todas las sedes: también alcanza otra sede el mismo día (domingo 2030-02-03 en Castellana si existiera); aquí verificamos Nogal el miércoles
  await cancel(U.admin, '2030-01-09', { reason: 'Festivo miércoles' });
  const slotNog = (await one(`select id from public.service_slots where site_id = $1 and day = 'miercoles'`, [U.sNogal])).id;
  assert.equal((await st(slotNog, '2030-01-09')).s, 'cancelado');
  assert.equal((await st(slotNog, '2030-01-02')).s, 'programado');
  // El líder no ve ni borra las de todas las sedes; cabeza sí
  assert.equal(await as(U.liderCamp, async () => (await db.query(`delete from public.service_cancellations where service_date = '2030-02-03' and site_id is null`)).affectedRows), 0);
  assert.equal(await as(U.cabeza, async () => (await db.query(`delete from public.service_cancellations where id = $1`, [all])).affectedRows), 1);
  assert.equal((await st(U.slotCamp, '2030-02-03')).s, 'programado');
  // Una fecha cancelada antes de generar nace cancelada
  await cancel(U.liderCamp, '2030-04-07', { slot: U.slotCamp, reason: 'Previa' });
  await gen(U.liderCamp, U.slotCamp, '2030-03-18', '2030-04-07');
  assert.deepEqual(await st(U.slotCamp, '2030-04-07'), { s: 'cancelado', r: 'Previa' });
  // Una cancelación duplicada no se permite
  await denied(() => cancel(U.liderCamp, '2030-04-07', { slot: U.slotCamp }), /unique|duplicate/i);
  await db.exec(`delete from public.service_cancellations`);
});

test('fase 5 · rotación: agregar un grupo y regenerar hacia adelante; lo ajustado a mano y lo especial no se tocan', async () => {
  // Ajuste a mano del 13 de enero (R2 → R4) y servicio especial un viernes
  const ev13 = (await one(`select id from public.service_events where slot_id = $1 and service_date = '2030-01-13'`, [U.slotCamp])).id;
  await denied(() => as(U.coord1, () => db.query(`select public.set_event_group($1, $2)`, [ev13, U.gR4])), /No tienes permiso/);
  await denied(() => as(U.liderCamp, () => db.query(`select public.set_event_group($1, $2)`, [ev13, U.gCas1])), /mismo horario/);
  await as(U.liderCamp, () => db.query(`select public.set_event_group($1, $2)`, [ev13, U.gR4]));
  const sp = (await as(U.liderCamp, () => db.query(`select public.create_special_event($1, '2030-01-11', $2, 'Vigilia') id`, [U.slotCamp, U.gR2]))).rows[0].id;
  await denied(() => as(U.coord1, () => db.query(`select public.create_special_event($1, '2030-01-18', $2)`, [U.slotCamp, U.gR2])), /No tienes permiso/);
  await denied(() => as(U.liderCamp, () => db.query(`select public.create_special_event($1, '2030-01-11', $2)`, [U.slotCamp, U.gR2])), /unique|duplicate/i);

  // Llega un quinto grupo: entra al final y, al regenerar desde febrero, la secuencia lo incluye
  await db.query(`insert into public.groups (service_slot_id, name) values ($1, 'R5')`, [U.slotCamp]);
  assert.equal((await one(`select rotation_order o from public.groups where name = 'R5' and service_slot_id = $1`, [U.slotCamp])).o, 5);
  const r = await gen(U.liderCamp, U.slotCamp, '2030-02-03', '2030-03-03');
  assert.equal(r.created, 0);
  const feb = await rows(`select e.service_date::text d, g.name g from public.service_events e join public.groups g on g.id = e.group_id where e.slot_id = $1 and e.service_date >= '2030-02-03' and e.service_date <= '2030-03-03' order by 1`, [U.slotCamp]);
  // turnos previos: 27/ene = R4 (turno 3) → 3-feb turno 4 = R5, luego R1, R2, R3, R4
  assert.deepEqual(feb.map((x) => x.g), ['R5', 'R1', 'R2', 'R3', 'R4']);
  // Lo anterior a la fecha de regeneración no cambió, y lo manual y lo especial siguen igual
  assert.equal((await one(`select g.name n from public.service_events e join public.groups g on g.id = e.group_id where e.id = $1`, [ev13])).n, 'R4');
  assert.equal((await one(`select g.name n from public.service_events e join public.groups g on g.id = e.group_id where e.id = $1`, [sp])).n, 'R2');
  // Regenerar sobre un rango con un ajuste manual: se cuenta como "kept"
  const r2 = await gen(U.liderCamp, U.slotCamp, '2030-01-01', '2030-01-20', U.gR1);
  assert.equal(r2.kept, 1);                                   // el 13 de enero
  // Reiniciar el ajuste vuelve a lo que dice la rotación
  await as(U.liderCamp, () => db.query(`select public.reset_event_group($1)`, [ev13]));
  assert.equal((await one(`select g.name n, manual from public.service_events e join public.groups g on g.id = e.group_id where e.id = $1`, [ev13])).n, 'R2');
  await denied(() => as(U.liderCamp, () => db.query(`select public.reset_event_group($1)`, [sp])), /especial/);
  // Un servicio especial se puede eliminar; uno de rotación, no
  assert.equal(await as(U.liderCamp, async () => (await db.query(`delete from public.service_events where id = $1`, [ev13])).affectedRows), 0);
  assert.equal(await as(U.liderCamp, async () => (await db.query(`delete from public.service_events where id = $1`, [sp])).affectedRows), 1);
  // El cliente no puede insertar ni cambiar el grupo directamente
  await denied(() => as(U.liderCamp, () => db.query(`update public.service_events set group_id = $2 where id = $1`, [ev13, U.gR3])), /permission denied/);
  await denied(() => as(U.liderCamp, () => db.query(`insert into public.service_events (slot_id, service_date, group_id, turn) values ($1, '2031-01-05', $2, 0)`, [U.slotCamp, U.gR1])), /permission denied/);
  // La nota sí
  await as(U.liderCamp, () => db.query(`update public.service_events set note = 'Traer sillas' where id = $1`, [ev13]));
  assert.equal((await one(`select note from public.service_events where id = $1`, [ev13])).note, 'Traer sillas');
  assert.equal(await as(U.coord1, async () => (await db.query(`update public.service_events set note = 'x' where id = $1`, [ev13])).affectedRows), 0);
});

// Planeación: servicios de Castellana (sábado PM): G1 con coord1, coord2, sup1, sup2, vol1.
test('fase 5 · planeación: borrador solo para planificadores, publicado para el grupo; varias personas por posición', async () => {
  const slotSab = (await one(`select service_slot_id id from public.groups where id = $1`, [U.gCas1])).id;
  await gen(U.liderCas, slotSab, '2030-01-01', '2030-01-31', U.gCas1);
  const evs = await rows(`select id, service_date::text d, group_id from public.service_events where slot_id = $1 order by service_date`, [slotSab]);
  U.evG1 = evs.find((e) => e.group_id === U.gCas1).id;
  U.evG2 = evs.find((e) => e.group_id === U.gCas2).id;
  // Posiciones de Castellana que aplican al sábado PM
  const pos = async (kind) => (await one(`select p.id from public.positions p join public.locations l on l.id = p.location_id where l.site_id = $1 and p.kind = $2 and p.is_active and cardinality(p.days) = 0 and cardinality(p.shifts) = 0 order by p.sort limit 1`, [U.sCas, kind])).id;
  U.posVol = await pos('voluntario'); U.posVol2 = (await one(`select p.id from public.positions p join public.locations l on l.id = p.location_id where l.site_id = $1 and p.kind = 'voluntario' and p.id <> $2 order by p.sort limit 1`, [U.sCas, U.posVol])).id;
  U.posSup = await pos('supervisor');
  const plan = (uid, ev, st) => as(uid, () => db.query(`insert into public.service_plans (event_id, status) values ($1, $2) on conflict (event_id) do update set status = excluded.status`, [ev, st]));
  const assign = (uid, ev, p, u) => as(uid, () => db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3) returning id`, [ev, p, u]));

  // Planifican coordinadores, supervisores y el líder; el voluntario no
  await plan(U.coord1, U.evG1, 'borrador');
  await assign(U.sup1, U.evG1, U.posVol, U.vol1);
  await assign(U.coord2, U.evG1, U.posVol, U.sup1);               // varias personas en la misma posición
  await assign(U.liderCas, U.evG1, U.posVol2, U.vol1);             // una persona en varias posiciones
  await denied(() => assign(U.vol1, U.evG1, U.posVol2, U.sup1), /row-level security/);
  await denied(() => plan(U.vol1, U.evG1, 'publicado'), /row-level security/);
  await denied(() => assign(U.coord1, U.evG2, U.posVol2, U.sup1), /row-level security|no pertenece/);      // coordinador del otro grupo no planifica este
  await denied(() => assign(U.liderNogal2, U.evG1, U.posVol, U.vol1), /row-level security/);
  await denied(() => assign(U.sup1, U.evG1, U.posVol, U.vol1), /duplicate|unique/i);
  await as(U.sup1, () => db.query(`insert into public.service_position_notes (event_id, position_id, note) values ($1, $2, 'Llegar 30 min antes')`, [U.evG1, U.posVol]));
  await denied(() => as(U.sup1, () => db.query(`insert into public.service_position_notes (event_id, position_id, note) values ($1, $2, '   ')`, [U.evG1, U.posVol2])), /check/);

  // Borrador: lo ven los planificadores, no el voluntario ni quien no es del grupo
  for (const u of [U.coord1, U.coord2, U.sup1, U.liderCas, U.cabeza, U.admin]) {
    assert.equal(await as(u, () => count('service_assignments', `event_id = '${U.evG1}'`)), 3, 'planificador ve el borrador');
    assert.equal(await as(u, () => count('service_position_notes', `event_id = '${U.evG1}'`)), 1);
  }
  for (const u of [U.vol1, U.volSuba, U.liderNogal]) {
    assert.equal(await as(u, () => count('service_assignments', `event_id = '${U.evG1}'`)), 0, 'el borrador no se ve');
    assert.equal(await as(u, () => count('service_position_notes', `event_id = '${U.evG1}'`)), 0);
    assert.equal(await as(u, () => count('service_plans', `event_id = '${U.evG1}'`)), 0);
  }
  // Publicar: ahora lo ve todo el grupo (y su servicio aparece en el calendario de quien está asignado)
  await plan(U.coord1, U.evG1, 'publicado');
  assert.ok((await one(`select published_at, published_by from public.service_plans where event_id = $1`, [U.evG1])).published_by === U.coord1);
  assert.equal(await as(U.vol1, () => count('service_assignments', `event_id = '${U.evG1}'`)), 3);
  assert.equal(await as(U.vol1, () => count('service_position_notes', `event_id = '${U.evG1}'`)), 1);
  assert.equal(await as(U.vol1, () => count('service_plans', `event_id = '${U.evG1}' and status = 'publicado'`)), 1);
  assert.equal(await as(U.volSuba, () => count('service_assignments', `event_id = '${U.evG1}'`)), 0);   // otro grupo no ve
  assert.equal(await as(U.liderNogal, () => count('service_assignments', `event_id = '${U.evG1}'`)), 0);
  assert.equal(await as(U.vol1, () => count('service_events', `id = '${U.evG1}'`)), 1);
  // Volver a borrador oculta de nuevo
  await plan(U.coord1, U.evG1, 'borrador');
  assert.equal(await as(U.vol1, () => count('service_assignments', `event_id = '${U.evG1}'`)), 0);
  assert.equal((await one(`select published_at from public.service_plans where event_id = $1`, [U.evG1])).published_at, null);
  await plan(U.coord1, U.evG1, 'publicado');
});

test('fase 5 · planeación: reglas de asignación (grupo, sede, día/franja, supervisor, posiciones ocultas)', async () => {
  const assign = (uid, ev, p, u) => as(uid, () => db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [ev, p, u]));
  // Solo integrantes del grupo que sirve
  await denied(() => assign(U.coord1, U.evG1, U.posVol2, U.volSuba), /no pertenece al grupo/);
  await denied(() => assign(U.coord1, U.evG1, U.posVol2, U.liderCas), /no pertenece al grupo/);
  // Posición de otra sede
  const posSuba = (await one(`insert into public.positions (location_id, code, name, kind) select l.id, 'N-1', 'Nogal 1', 'voluntario' from public.locations l where l.site_id = $1 limit 1 returning id`, [U.sNogal])).id;
  await denied(() => assign(U.coord1, U.evG1, posSuba, U.vol1), /no es de la sede/);
  // Posición de supervisor: no para voluntarios; sí para supervisores; los coordinadores no ocupan ninguna
  await denied(() => assign(U.coord1, U.evG1, U.posSup, U.vol1), /solo se asignan a supervisores/);
  await assign(U.coord1, U.evG1, U.posSup, U.sup1);
  await denied(() => assign(U.coord1, U.evG1, U.posSup, U.coord2), /Los coordinadores no ocupan posiciones/);
  await denied(() => assign(U.coord1, U.evG1, U.posVol2, U.coord2), /Los coordinadores no ocupan posiciones/);
  // Un supervisor puede tomar posición de voluntario
  await assign(U.coord1, U.evG1, U.posVol2, U.sup1);
  // Posición que no aplica a ese día / franja / oculta
  const mk = async (code, extra) => (await one(`insert into public.positions (location_id, code, name, kind, ${extra.col}) select l.id, $2, $2, 'voluntario', ${extra.val} from public.locations l where l.site_id = $1 limit 1 returning id`, [U.sCas, code])).id;
  const soloDom = await mk('T-DOM', { col: 'days', val: `'{domingo}'` });
  const soloAm = await mk('T-AM', { col: 'shifts', val: `'{am}'` });
  const oculta = await mk('T-OFF', { col: 'is_active', val: 'false' });
  await denied(() => assign(U.coord1, U.evG1, soloDom, U.vol1), /no aplica a ese día/);
  await denied(() => assign(U.coord1, U.evG1, soloAm, U.vol1), /no aplica a esa franja/);
  await denied(() => assign(U.coord1, U.evG1, oculta, U.vol1), /oculta/);
  // Servicio sin grupo: no se planea
  const ev = (await one(`insert into public.service_events (slot_id, service_date, group_id, kind, manual) select slot_id, '2031-06-01', null, 'especial', true from public.service_events where id = $1 returning id`, [U.evG1])).id;
  await denied(() => assign(U.admin, ev, U.posVol, U.vol1), /todavía no tiene un grupo/);
  // Nota en posición de otra sede
  await denied(() => as(U.coord1, () => db.query(`insert into public.service_position_notes (event_id, position_id, note) values ($1, $2, 'x')`, [U.evG1, posSuba])), /no es de la sede/);
});

test('fase 5 · planeación: cambiar de grupo el servicio borra la planeación; salir del grupo quita lo futuro y deja el historial', async () => {
  const cnt = (ev) => count('service_assignments', `event_id = '${ev}'`);
  assert.ok((await cnt(U.evG1)) >= 5);
  // Regenerar con un cambio de grupo no pisa un servicio con planeación: queda "protected"
  const slotSab = (await one(`select service_slot_id id from public.groups where id = $1`, [U.gCas1])).id;
  const grpOf = async (ev) => (await one(`select group_id g from public.service_events where id = $1`, [ev])).g;
  await db.query(`update public.groups set rotation_order = 2 where id = $1`, [U.gCas1]);
  await db.query(`update public.groups set rotation_order = 1 where id = $1`, [U.gCas2]);
  const r = await gen(U.liderCas, slotSab, '2030-01-01', '2030-01-31');
  assert.ok(r.protected >= 1, 'el servicio con planeación no cambia de grupo');
  assert.equal(await grpOf(U.evG1), U.gCas1);
  assert.ok((await cnt(U.evG1)) >= 5, 'y conserva su planeación');
  assert.equal(await grpOf(U.evG2), U.gCas1, 'el servicio sin planeación sí cambia con la rotación');
  // Se restablece el orden y se regenera
  await db.query(`update public.groups set rotation_order = 1 where id = $1`, [U.gCas1]);
  await db.query(`update public.groups set rotation_order = 2 where id = $1`, [U.gCas2]);
  assert.equal((await gen(U.liderCas, slotSab, '2030-01-01', '2030-01-31')).protected, 0);
  assert.equal(await grpOf(U.evG2), U.gCas2);
  // Cambiar el grupo de un servicio a mano borra la planeación del grupo anterior
  const evM = (await one(`select id from public.service_events where id = $1`, [U.evG2])).id;
  await db.query(`insert into public.service_plans (event_id, status) values ($1, 'borrador')`, [evM]);
  await as(U.liderCas, () => db.query(`select public.set_event_group($1, $2)`, [evM, U.gCas1]));
  assert.equal(await count('service_plans', `event_id = '${evM}'`), 0);
  await as(U.liderCas, () => db.query(`select public.reset_event_group($1)`, [evM]));
  assert.equal(await grpOf(evM), U.gCas2);
  // Una asignación futura de vol1 desaparece cuando vol1 cambia de grupo; las pasadas se quedan
  const past = (await one(`insert into public.service_events (slot_id, service_date, group_id, kind, manual) select slot_id, '2020-01-05', group_id, 'especial', true from public.service_events where id = $1 returning id`, [U.evG1])).id;
  await db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [past, U.posVol, U.vol1]);
  const fut = (await one(`select count(*)::int n from public.service_assignments where user_id = $1 and event_id = $2`, [U.vol1, U.evG1])).n;
  assert.ok(fut >= 1);
  await db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.vol1, U.gCas2]);
  assert.equal((await one(`select count(*)::int n from public.service_assignments where user_id = $1 and event_id = $2`, [U.vol1, U.evG1])).n, 0);
  assert.equal((await one(`select count(*)::int n from public.service_assignments where user_id = $1 and event_id = $2`, [U.vol1, past])).n, 1, 'el historial pasado se conserva');
  await db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.vol1, U.gCas1]);
  // Un supervisor que baja a voluntario pierde sus posiciones de supervisor futuras, no las de voluntario
  const supPos = async () => (await rows(`select p.kind from public.service_assignments a join public.positions p on p.id = a.position_id where a.user_id = $1 and a.event_id = $2`, [U.sup1, U.evG1])).map((x) => x.kind).sort();
  assert.ok((await supPos()).includes('supervisor'));
  await db.query(`update public.memberships set role = 'voluntario' where user_id = $1`, [U.sup1]);
  assert.ok(!(await supPos()).includes('supervisor') && (await supPos()).includes('voluntario'));
  await db.query(`update public.memberships set role = 'supervisor' where user_id = $1`, [U.sup1]);
  // Quien pasa a coordinador deja sus posiciones futuras
  await db.query(`update public.memberships set role = 'supervisor' where user_id = $1`, [U.coord2]);
  await db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [U.evG1, U.posVol, U.coord2]);
  await db.query(`update public.memberships set role = 'coordinador' where user_id = $1`, [U.coord2]);
  assert.equal(await count('service_assignments', `user_id = '${U.coord2}'`), 0);
  // Historial: cada quien ve el suyo, también el pasado de un grupo del que ya salió
  await db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.vol1, U.gCas2]);
  const hist = await as(U.vol1, () => count('service_assignments', `user_id = '${U.vol1}'`));
  assert.equal(hist, 0, 'el borrador/publicación depende del servicio: sin plan publicado no hay historial visible al exmiembro');
  await db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.vol1, U.gCas1]);
});

test('fase 5 · archivos de programación: solo planificadores suben; el grupo los ve; máximo 5; storage por servicio', async () => {
  const file = (uid, ev, n, size = 1000) => as(uid, () => db.query(`insert into public.schedule_files (event_id, storage_path, file_name, mime_type, size_bytes) values ($1, $2, $3, 'application/pdf', $4)`, [ev, `castellana/${ev}/${n}.pdf`, `${n}.pdf`, size]));
  await file(U.coord1, U.evG1, 'a');
  await file(U.sup1, U.evG1, 'b');
  await denied(() => file(U.vol1, U.evG1, 'c'), /row-level security/);
  await denied(() => file(U.coord1, U.evG2, 'c'), /row-level security/);
  await denied(() => file(U.coord1, U.evG1, 'd', 10485761), /check/);
  await denied(() => file(U.coord1, U.evG1, 'e', 0), /check/);
  // El grupo los ve; otro grupo no
  assert.equal(await as(U.vol1, () => count('schedule_files', `event_id = '${U.evG1}'`)), 2);
  assert.equal(await as(U.volSuba, () => count('schedule_files', `event_id = '${U.evG1}'`)), 0);
  assert.equal(await as(U.liderNogal, () => count('schedule_files', `event_id = '${U.evG1}'`)), 0);
  assert.equal(await as(U.liderCas, () => count('schedule_files', `event_id = '${U.evG1}'`)), 2);
  // Máximo 5
  for (const n of ['f3', 'f4', 'f5']) await file(U.coord1, U.evG1, n);
  await denied(() => file(U.coord1, U.evG1, 'f6'), /Máximo 5/);
  // Solo planificadores quitan
  assert.equal(await as(U.vol1, async () => (await db.query(`delete from public.schedule_files where file_name = 'a.pdf'`)).affectedRows), 0);
  assert.equal(await as(U.coord1, async () => (await db.query(`delete from public.schedule_files where file_name = 'a.pdf'`)).affectedRows), 1);

  // Storage: la carpeta [1] es la sede y [2] el servicio
  const obj = (uid, path) => as(uid, () => db.query(`insert into storage.objects (bucket_id, name) values ('schedules', $1)`, [path]));
  await obj(U.coord1, `castellana/${U.evG1}/x.pdf`);
  await denied(() => obj(U.vol1, `castellana/${U.evG1}/y.pdf`), /row-level security/);
  await denied(() => obj(U.coord1, `castellana/${U.evG2}/y.pdf`), /row-level security/);
  await denied(() => obj(U.coord1, `castellana/no-es-uuid/y.pdf`), /row-level security/);
  await denied(() => obj(U.coord1, `solo.pdf`), /row-level security/);
  const visible = (uid) => as(uid, async () => (await one(`select count(*)::int n from storage.objects where bucket_id = 'schedules'`)).n);
  assert.equal(await visible(U.vol1), 1);
  assert.equal(await visible(U.volSuba), 0);
  assert.equal(await visible(U.liderNogal), 0);
  assert.equal((await one(`select public from storage.buckets where id = 'schedules'`)).public, false);
});

test('fase 5 · el grupo que sirve ve su servicio; quien no, no; anon nada; fechas y limpieza al borrar', async () => {
  assert.equal(await as(U.vol1, () => count('service_events', `id = '${U.evG1}'`)), 1);
  assert.equal(await as(U.volSuba, () => count('service_events', `id = '${U.evG1}'`)), 0);
  assert.equal(await as(U.liderNogal, () => count('service_events', `id = '${U.evG1}'`)), 0);
  assert.equal(await as(U.liderCas, () => count('service_events', `id = '${U.evG1}'`)), 1);
  for (const t of ['service_events', 'service_cancellations', 'service_plans', 'service_assignments', 'service_position_notes', 'schedule_files']) {
    await db.exec(`set role anon`);
    try { await denied(() => db.query(`select * from public.${t}`), /permission denied/); } finally { await db.exec(`reset role`); }
  }
  assert.equal((await one(`select public.today_co() = (now() at time zone 'America/Bogota')::date ok`)).ok, true);
  // Borrar un horario borra servicios y su planeación
  const n = await count('service_assignments');
  assert.ok(n > 0);
  const slotSab = (await one(`select service_slot_id id from public.groups where id = $1`, [U.gCas1])).id;
  await db.query(`update public.service_events set group_id = null where slot_id = $1`, [slotSab]);
  assert.equal(await count('service_assignments', `event_id in (select id from public.service_events where slot_id = '${slotSab}')`), 0, 'sin grupo no queda planeación');
  assert.equal(await count('service_plans', `event_id in (select id from public.service_events where slot_id = '${slotSab}')`), 0);
});

// ───────────── Fase 6 · Asistente ─────────────
const hits = (uid, q) => as(uid, async () => (await rows(`select kind, title, site_slug from public.search_manual($1)`, [q])));

test('fase 6 · búsqueda: encuentra posiciones, flujos y novedades vigentes, solo de lo que la persona puede ver', async () => {
  // Datos propios de cada sede (la búsqueda debe respetar RLS)
  await as(U.admin, async () => {
    const locCas = (await one(`select l.id from public.locations l where l.site_id = $1 limit 1`, [U.sCas])).id;
    const locNog = (await one(`select l.id from public.locations l where l.site_id = $1 limit 1`, [U.sNogal])).id;
    await db.query(`insert into public.positions (location_id, code, name, kind, description, uses_radio) values ($1, 'ZZ1', 'Puerta de parqueadero', 'voluntario', 'Orienta los carros hacia el parqueadero lateral', true)`, [locCas]);
    await db.query(`insert into public.positions (location_id, code, name, kind, description) values ($1, 'ZZ2', 'Puerta de bicicletas', 'voluntario', 'Recibe bicicletas en el bicicletero')`, [locNog]);
    await db.query(`insert into public.positions (location_id, code, name, kind, description, is_active) values ($1, 'ZZ3', 'Parqueadero oculto', 'voluntario', 'parqueadero', false)`, [locCas]);
    const f = (await one(`insert into public.flows (site_id, name, description) values ($1, 'Auditorio lleno', 'Qué hacer cuando se llena el auditorio principal') returning id`, [U.sCas])).id;
    await db.query(`insert into public.flow_steps (flow_id, step_order, title, instructions) values ($1, 1, 'Cerrar la entrada', 'Avisa por radio y cierra las puertas principales')`, [f]);
    await db.query(`insert into public.announcements (title, body) values ('Cambio de horario del parqueadero', 'Desde el domingo abre más temprano')`);
    await db.query(`insert into public.announcements (title, body, ends_at, starts_at) values ('Parqueadero vencido', 'ya pasó', now() - interval '1 day', now() - interval '3 days')`);
  });
  const titles = (r) => r.map((x) => x.title);

  const vol = await hits(U.vol1, '¿Dónde dejo los carros en el parqueadero?');
  assert.ok(titles(vol).some((t) => t.startsWith('ZZ1 · Puerta de parqueadero')), 'encuentra la posición por su descripción');
  assert.ok(titles(vol).includes('Cambio de horario del parqueadero'), 'y la novedad vigente');
  assert.ok(!titles(vol).some((t) => t.includes('vencido')), 'no la vencida');
  assert.ok(!titles(await hits(U.admin, 'parqueadero')).some((t) => t.includes('vencido')), 'ni siquiera quien administra novedades la ve en el asistente');
  assert.ok(!titles(vol).some((t) => t.startsWith('ZZ3')), 'ni las posiciones ocultas');
  assert.ok(!titles(vol).some((t) => t.startsWith('ZZ2')), 'ni lo de otra sede');
  // Una pregunta en lenguaje natural: varias palabras, con acentos y signos
  const flow = await hits(U.vol1, 'Qué hago cuando se llena el auditorio?');
  assert.equal(flow[0].kind, 'flujo');
  assert.ok(flow[0].title.startsWith('Auditorio lleno'));
  const step = await as(U.vol1, () => one(`select body from public.search_manual('cerrar entrada puertas') where kind = 'flujo'`));
  assert.match(step.body, /1\. Cerrar la entrada: Avisa por radio/);
  // Otra sede ve lo suyo
  const nog = await hits(U.liderNogal2, 'bicicletas');
  assert.deepEqual(nog.filter((x) => x.kind === 'posicion').map((x) => x.title.slice(0, 3)), ['ZZ2']);
  assert.ok(!(await hits(U.liderNogal2, 'parqueadero')).some((x) => x.kind === 'posicion'), 'el líder de Nogal no encuentra posiciones de Castellana');
  // Novedades de un grupo solo para ese grupo
  await as(U.coord1, () => db.query(`insert into public.announcements (title, body, group_id) values ('Reunión del grupo uno', 'Traer chaleco naranja', $1)`, [U.gCas1]));
  assert.ok((await hits(U.vol1, 'chaleco naranja')).some((x) => x.kind === 'novedad'));
  assert.equal((await hits(U.volSuba, 'chaleco naranja')).length, 0);
  // Admin ve todo
  assert.ok((await hits(U.admin, 'bicicletas')).length >= 1);
  // Consultas vacías o de pura puntuación no devuelven nada ni fallan
  for (const q of ['', '   ', '?!', 'de la el', null]) assert.equal((await hits(U.vol1, q)).length, 0);
  // Una consulta con caracteres de sintaxis de tsquery no la rompe
  await hits(U.vol1, `'a' & (b | !c) :* <-> \\ ;--`);
  // El límite
  assert.ok((await as(U.admin, () => rows(`select * from public.search_manual('puerta posición parqueadero bicicletas', 2)`))).length <= 2);
  await denied(async () => { await db.exec(`set role anon`); try { await db.query(`select * from public.search_manual('x')`); } finally { await db.exec(`reset role`); } }, /permission denied/);
});

test('fase 6 · límite diario del asistente: se cuenta por persona y por día, y no se puede manipular', async () => {
  const use = (uid, limit) => as(uid, async () => (await one(`select public.chat_consume($1) r`, [limit])).r);
  assert.deepEqual(await use(U.vol1, 3), { allowed: true, used: 1, limit: 3 });
  assert.deepEqual(await use(U.vol1, 3), { allowed: true, used: 2, limit: 3 });
  assert.deepEqual(await use(U.vol1, 3), { allowed: true, used: 3, limit: 3 });
  assert.deepEqual(await use(U.vol1, 3), { allowed: false, used: 3, limit: 3 }, 'al llegar al límite no cuenta más');
  assert.deepEqual(await use(U.vol1, 3), { allowed: false, used: 3, limit: 3 });
  assert.deepEqual(await use(U.coord1, 3), { allowed: true, used: 1, limit: 3 }, 'cada persona tiene el suyo');
  // Límites absurdos se acotan
  assert.equal((await use(U.sup1, 0)).limit, 1);
  assert.equal((await use(U.volSuba, 100000)).limit, 500);
  // Nadie lee ni escribe la tabla directamente; anon no ejecuta la función
  await denied(() => as(U.vol1, () => db.query(`select * from public.chat_usage`)), /permission denied/);
  await denied(() => as(U.vol1, () => db.query(`update public.chat_usage set n = 0`)), /permission denied/);
  await denied(() => as(U.vol1, () => db.query(`delete from public.chat_usage`)), /permission denied/);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select public.chat_consume(5)`), /permission denied/); } finally { await db.exec(`reset role`); }
  // Cambia el día: vuelve a empezar
  await db.query(`update public.chat_usage set day = day - 1 where user_id = $1`, [U.vol1]);
  assert.equal((await use(U.vol1, 3)).used, 1);
  // Si la persona se elimina, se va su conteo
  assert.ok((await count('chat_usage')) >= 4);
});

// ───────────── Protección de datos personales ─────────────
test('privacidad · constancia de aceptación: cada quien crea y ve solo la suya; nadie la cambia ni la borra', async () => {
  const accept = (uid, who, v = '2026-10-19') => as(uid, () => db.query(`insert into public.consents (user_id, policy_version) values ($1, $2)`, [who, v]));
  await accept(U.vol1, U.vol1);
  await accept(U.vol1, U.vol1, '2027-01-01');                         // otra versión de los textos: otra constancia
  await denied(() => accept(U.vol1, U.vol1), /duplicate|unique/i);
  await denied(() => accept(U.vol1, U.coord1), /row-level security/);   // nadie acepta en nombre de otro
  await denied(() => accept(U.admin, U.vol1, 'x'), /row-level security/);
  await accept(U.coord1, U.coord1);
  assert.equal(await as(U.vol1, () => count('consents')), 2);
  assert.equal(await as(U.coord1, () => count('consents')), 1);
  assert.equal(await as(U.admin, () => count('consents')), 0, 'ni siquiera el administrador ve la de otros');
  assert.equal(await as(U.liderCas, () => count('consents')), 0);
  await denied(() => as(U.vol1, () => db.query(`update public.consents set accepted_at = now() - interval '1 year'`)), /permission denied/);
  await denied(() => as(U.vol1, () => db.query(`delete from public.consents`)), /permission denied/);
  await denied(() => as(U.vol1, () => db.query(`insert into public.consents (user_id, policy_version) values ($1, '')`, [U.vol1])), /check/);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select * from public.consents`), /permission denied/); } finally { await db.exec(`reset role`); }
});

test('privacidad · darse de baja: borra la cuenta y sus datos, deja las novedades sin su nombre y no puede volver sin nueva invitación', async () => {
  await as(U.admin, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.baja@x.com', $1)`, [[U.sCamp]]));
  await signup('liderBaja', 'lider.baja@x.com');
  const me = U.liderBaja;
  await as(me, () => db.query(`insert into public.announcements (title, body, site_id) values ('Aviso de quien se va', 'texto', $1)`, [U.sCamp]));
  await as(me, () => db.query(`insert into public.consents (user_id, policy_version) values ($1, 'v1')`, [me]));
  await as(me, () => db.query(`select public.chat_consume(5)`));
  const before = await one(`select author_name, author_role from public.announcements where title = 'Aviso de quien se va'`);
  assert.ok(before.author_name && before.author_role, 'la novedad nace con el nombre y el rol de su autor');

  await as(me, () => db.query(`select public.delete_my_account()`));
  assert.equal(await count('profiles', `user_id = '${me}'`), 0);
  assert.equal(await count('profile_private', `user_id = '${me}'`), 0);
  assert.equal(await count('site_leaders', `user_id = '${me}'`), 0);
  assert.equal(await count('consents', `user_id = '${me}'`), 0);
  assert.equal(await count('chat_usage', `user_id = '${me}'`), 0);
  assert.equal(await count('invitations', `email = 'lider.baja@x.com'`), 0, 'sin invitación no puede volver a entrar');
  assert.equal((await one(`select count(*)::int n from auth.users where id = $1`, [me])).n, 0);
  await denied(() => signup('liderBaja2', 'lider.baja@x.com'), /no autorizado/i);
  const after = await one(`select author_id, author_name, author_role, title from public.announcements where title = 'Aviso de quien se va'`);
  assert.deepEqual(after, { author_id: null, author_name: null, author_role: null, title: 'Aviso de quien se va' }, 'la novedad queda, sin datos de la persona');
});

test('privacidad · baja de un integrante: se va con su grupo y sus asignaciones pasadas; el administrador y la cabeza no se dan de baja solos', async () => {
  await db.query(`insert into public.chat_usage (user_id, day, n) values ($1, current_date, 2)`, [U.volDom]);
  await as(U.volDom, () => db.query(`select public.delete_my_account()`));
  assert.equal(await count('memberships', `user_id = '${U.volDom}'`), 0);
  assert.equal(await count('chat_usage', `user_id = '${U.volDom}'`), 0);
  await denied(() => as(U.admin, () => db.query(`select public.delete_my_account()`)), /no pueden eliminarse a sí mismos/);
  await denied(() => as(U.cabeza, () => db.query(`select public.delete_my_account()`)), /no pueden eliminarse a sí mismos/);
  assert.equal(await count('profiles', `user_id = '${U.admin}'`), 1);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select public.delete_my_account()`), /permission denied/); } finally { await db.exec(`reset role`); }
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '', false);`);
  try { await denied(() => db.query(`select public.delete_my_account()`), /Inicia sesión/); } finally { await db.exec(`reset role`); }   // sesión sin persona: no hace nada en silencio
  // Quien elimina a otra persona (delete_person) también deja las novedades sin su nombre
  await as(U.admin, () => db.query(`insert into public.invitations (email, leader_site_ids) values ('lider.baja3@x.com', $1)`, [[U.sCamp]]));
  await signup('liderBaja3', 'lider.baja3@x.com');
  await as(U.liderBaja3, () => db.query(`insert into public.announcements (title, body, site_id) values ('Aviso dos', '', $1)`, [U.sCamp]));
  await as(U.admin, () => db.query(`select public.delete_person($1)`, [U.liderBaja3]));
  assert.deepEqual(await one(`select author_name, author_role from public.announcements where title = 'Aviso dos'`), { author_name: null, author_role: null });
});

// ───────────── Fase 7 · Reemplazos y apoyos (Campestre: grupos R1..R5 del domingo) ─────────────
const rpc = (uid, sqlText, params = []) => as(uid, async () => (await db.query(sqlText, params)).rows);
const nextOf = async (group) => (await one(`select id from public.service_events where group_id = $1 and status = 'programado' and service_date >= public.today_co() order by service_date limit 1`, [group])).id;

test('fase 7 · preparación: personas de varios grupos de Campestre y el servicio próximo de R1', async () => {
  U.gR5 = (await one(`select id from public.groups where service_slot_id = $1 and name = 'R5'`, [U.slotCamp])).id;
  const invite7 = (email, group, role) => as(U.liderCamp, () => db.query(`insert into public.invitations (email, group_id, group_role) values ($1, $2, $3)`, [email, group, role]));
  for (const [n, g, r] of [['cR1', U.gR1, 'coordinador'], ['sR1', U.gR1, 'supervisor'], ['vR1', U.gR1, 'voluntario'], ['vR2', U.gR2, 'voluntario'], ['cR2', U.gR2, 'coordinador'], ['sR3', U.gR3, 'supervisor'], ['vR4', U.gR4, 'voluntario'], ['vR5', U.gR5, 'voluntario']]) {
    await invite7(`${n.toLowerCase()}@x.com`, g, r);
    await signup(n, `${n.toLowerCase()}@x.com`);
  }
  // Posiciones propias de Campestre (la carga inicial solo trae las de Castellana)
  const loc = (await one(`select l.id from public.locations l where l.site_id = $1 order by l.sort limit 1`, [U.sCamp])).id;
  U.pCV1 = (await one(`insert into public.positions (location_id, code, name, kind) values ($1, 'C1', 'Entrada', 'voluntario') returning id`, [loc])).id;
  U.pCV2 = (await one(`insert into public.positions (location_id, code, name, kind) values ($1, 'C2', 'Parqueadero', 'voluntario') returning id`, [loc])).id;
  U.pCS = (await one(`insert into public.positions (location_id, code, name, kind) values ($1, 'C3', 'Supervisor general', 'supervisor') returning id`, [loc])).id;
  U.evR1 = await nextOf(U.gR1);
  const later = (await one(`select id from public.service_events where group_id = $1 and status = 'programado' and id <> $2 order by service_date offset 0 limit 1`, [U.gR1, U.evR1])).id;
  assert.equal((await one(`select public.event_is_next($1) r`, [U.evR1])).r, true);
  assert.equal((await one(`select public.event_is_next($1) r`, [later])).r, false, 'solo el próximo servicio del grupo');
  assert.equal((await one(`select public.event_is_next('00000000-0000-4000-8000-0000000000ff') r`)).r, false);
});

test('fase 7 · ausencias: las registra quien planifica el próximo servicio; se quitan sus posiciones y no se le pueden asignar', async () => {
  const assign = (uid, p, u) => as(uid, () => db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [U.evR1, p, u]));
  await as(U.cR1, () => db.query(`insert into public.service_plans (event_id) values ($1) on conflict do nothing`, [U.evR1]));
  await assign(U.cR1, U.pCV1, U.vR1);
  await assign(U.cR1, U.pCV2, U.vR1);
  assert.equal(await count('service_assignments', `event_id = '${U.evR1}' and user_id = '${U.vR1}'`), 2);
  await denied(() => rpc(U.vR1, `select public.mark_absent($1, $2)`, [U.evR1, U.vR1]), /No tienes permiso/);        // el voluntario no se marca solo
  await denied(() => rpc(U.vR2, `select public.mark_absent($1, $2)`, [U.evR1, U.vR1]), /No tienes permiso/);
  await denied(() => rpc(U.cR2, `select public.mark_absent($1, $2)`, [U.evR1, U.vR1]), /No tienes permiso/);        // coordinador de otro grupo
  await denied(() => rpc(U.cR1, `select public.mark_absent($1, $2)`, [U.evR1, U.vR2]), /no está en este servicio/);
  const later = (await one(`select id from public.service_events where group_id = $1 and status = 'programado' and id <> $2 order by service_date limit 1`, [U.gR1, U.evR1])).id;
  await denied(() => rpc(U.cR1, `select public.mark_absent($1, $2)`, [later, U.vR1]), /próximo servicio/);
  await rpc(U.sR1, `select public.mark_absent($1, $2)`, [U.evR1, U.vR1]);                                          // el supervisor también
  assert.equal(await count('service_assignments', `event_id = '${U.evR1}' and user_id = '${U.vR1}'`), 0, 'se le quitan las posiciones');
  await denied(() => assign(U.cR1, U.pCV1, U.vR1), /ausente/);
  assert.equal(await as(U.vR1, () => count('service_absences')), 1, 'la persona ve su propia ausencia');
  assert.equal(await as(U.vR2, () => count('service_absences')), 0);
  assert.equal(await as(U.cR1, () => count('service_absences')), 1);
  await rpc(U.liderCamp, `select public.unmark_absent($1, $2)`, [U.evR1, U.vR1]);                                  // el líder la deshace
  await assign(U.cR1, U.pCV1, U.vR1);
  await denied(() => rpc(U.vR1, `select public.unmark_absent($1, $2)`, [U.evR1, U.vR1]), /No tienes permiso/);
});

test('fase 7 · apoyo directo: se busca por nombre sin correos, solo de la misma sede, sin coordinadores ni choques', async () => {
  const cands = (uid, q = '') => rpc(uid, `select * from public.support_candidates($1, $2)`, [U.evR1, q]);
  const list = await cands(U.cR1);
  const names = list.map((r) => r.full_name).sort();
  assert.deepEqual(names, ['sR3', 'vR2', 'vR4', 'vR5'], 'voluntarios y supervisores de otros grupos de la sede');
  assert.deepEqual(Object.keys(list[0]).sort(), ['full_name', 'group_name', 'role', 'user_id'], 'solo nombre, grupo y rol: nunca el correo');
  assert.deepEqual((await cands(U.cR1, 'r2')).map((r) => r.full_name), ['vR2'], 'filtra por nombre');
  assert.ok(!names.some((n) => ['cR2', 'cR1', 'sR1', 'vR1'].includes(n)), 'ni coordinadores ni los del propio grupo');
  assert.ok(!(await cands(U.cR1, 'vol')).some((r) => r.user_id === U.vol1), 'ni personas de otras sedes');
  await denied(() => cands(U.vR1), /No tienes permiso/);
  await denied(() => cands(U.vR2), /No tienes permiso/);
  assert.equal((await cands(U.liderCamp)).length, 4);

  const add = (uid, user, ev = U.evR1) => rpc(uid, `select public.add_supporter($1, $2)`, [ev, user]);
  await denied(() => add(U.vR1, U.vR2), /No tienes permiso/);
  await denied(() => add(U.cR2, U.vR2), /No tienes permiso/);
  await denied(() => add(U.cR1, U.cR2), /no puede apoyar/, 'un coordinador no apoya');
  await denied(() => add(U.cR1, U.vol1), /no puede apoyar/, 'otra sede');
  await denied(() => add(U.cR1, U.vR1), /no puede apoyar/, 'del mismo grupo');
  const later = (await one(`select id from public.service_events where group_id = $1 and status = 'programado' and id <> $2 order by service_date limit 1`, [U.gR1, U.evR1])).id;
  await denied(() => add(U.cR1, U.vR2, later), /próximo servicio/);
  await add(U.sR1, U.vR2);
  await add(U.cR1, U.sR3);
  await denied(() => add(U.cR1, U.vR2), /no puede apoyar/, 'ya está agregado');
  assert.equal(await count('service_supporters', `event_id = '${U.evR1}'`), 2);
  assert.ok(!(await cands(U.cR1)).some((r) => r.user_id === U.vR2), 'quien ya apoya no sale en la búsqueda');
  assert.equal((await one(`select source from public.service_supporters where user_id = $1`, [U.vR2])).source, 'directo');
});

test('fase 7 · un apoyo es parte del servicio ese día: se le asignan posiciones, ve la planeación publicada y el servicio', async () => {
  const assign = (uid, p, u) => as(uid, () => db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [U.evR1, p, u]));
  await assign(U.cR1, U.pCV2, U.vR2);                                                       // voluntario de otro grupo en posición de voluntario
  await denied(() => assign(U.cR1, U.pCS, U.vR2), /solo se asignan a supervisores/);
  await assign(U.cR1, U.pCS, U.sR3);                                                        // supervisor de otro grupo en posición de supervisor
  await denied(() => assign(U.cR1, U.pCV1, U.vR4), /no pertenece al grupo/, 'quien no apoya no puede recibir posiciones');
  assert.equal(await count('service_assignments', `event_id = '${U.evR1}' and user_id in ('${U.vR2}', '${U.sR3}')`), 2);
  assert.equal(await as(U.vR4, () => count('service_supporters')), 0, 'quien no es del servicio no ve los apoyos');
  assert.equal(await as(U.vol1, () => count('service_supporters')), 0);
  assert.equal(await as(U.vR2, () => count('service_supporters')), 2, 'el apoyo y el grupo sí los ven');
  assert.equal(await as(U.vR1, () => count('service_supporters')), 2);
  // Borrador: el apoyo no lo ve; publicado: sí, y también puede abrir el servicio
  assert.equal(await as(U.vR2, () => count('service_assignments', `event_id = '${U.evR1}'`)), 0, 'el borrador no lo ve ni el apoyo');
  assert.equal(await as(U.vR2, () => count('service_events', `id = '${U.evR1}'`)), 1, 'el apoyo puede abrir el servicio');
  assert.equal(await as(U.vR4, () => count('service_events', `id = '${U.evR1}'`)), 0, 'quien no apoya, no');
  await as(U.cR1, () => db.query(`update public.service_plans set status = 'publicado' where event_id = $1`, [U.evR1]));
  assert.ok((await as(U.vR2, () => count('service_assignments', `event_id = '${U.evR1}'`))) >= 3, 'publicada: ve la planeación del grupo');
  assert.equal(await as(U.vR4, () => count('service_assignments', `event_id = '${U.evR1}'`)), 0);
  // event_people: integrantes y apoyos con su grupo de origen, sin correos
  const people = await rpc(U.vR1, `select * from public.event_people($1)`, [U.evR1]);
  assert.ok(people.some((p) => p.origin === 'apoyo' && p.full_name === 'vR2' && p.group_name === 'R2'));
  assert.ok(people.some((p) => p.origin === 'miembro' && p.full_name === 'vR1'));
  assert.deepEqual(Object.keys(people[0]).sort(), ['absent', 'full_name', 'group_name', 'origin', 'role', 'user_id']);
  assert.equal((await rpc(U.vR2, `select * from public.event_people($1)`, [U.evR1])).length, people.length, 'el apoyo ve a todos los del servicio');
  await denied(() => rpc(U.vR4, `select * from public.event_people($1)`, [U.evR1]), /No tienes permiso/);
  assert.equal((await rpc(U.vR2, `select public.event_group_name($1) n`, [U.evR1]))[0].n, 'R1');
  assert.equal((await rpc(U.vR4, `select public.event_group_name($1) n`, [U.evR1]))[0].n, null);
  // Su propia lista
  const mine = await rpc(U.vR2, `select * from public.my_support_events()`);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].group_name, 'R1');
});

test('fase 7 · choques de horario: sin horas se asume choque; con horas, solo si se cruzan; una ausencia lo libera', async () => {
  // Otro horario de Campestre el mismo domingo, con su grupo y su voluntario
  const date = (await one(`select service_date::text d from public.service_events where id = $1`, [U.evR1])).d;
  const slotAm = (await one(`insert into public.service_slots (site_id, day, shift) values ($1, 'domingo', 'am') returning id`, [U.sCamp])).id;
  const gX = (await one(`insert into public.groups (service_slot_id, name) values ($1, 'AM-X') returning id`, [slotAm])).id;
  await as(U.liderCamp, () => db.query(`insert into public.invitations (email, group_id, group_role) values ('vx@x.com', $1, 'voluntario')`, [gX]));
  await signup('vX', 'vx@x.com');
  await as(U.liderCamp, () => db.query(`select public.generate_service_events($1, $2::date, $2::date, $3)`, [slotAm, date, gX]));
  const evX = (await one(`select id from public.service_events where slot_id = $1 and service_date = $2`, [slotAm, date])).id;
  const can = async () => (await one(`select public.can_support_event($1, $2) r`, [U.vX, U.evR1])).r;
  const setTimes = async (slot, a, s, e) => db.query(`update public.service_slots set arrival_time = $2, start_time = $3, end_time = $4 where id = $1`, [slot, a, s, e]);

  assert.equal(await can(), false, 'sin horas cargadas se asume choque');
  await setTimes(U.slotCamp, '12:00', '12:30', '14:00');
  await setTimes(slotAm, '07:30', '08:00', '10:00');
  assert.equal(await can(), true, 'horarios que no se cruzan: puede apoyar');
  await setTimes(slotAm, '11:00', '11:30', '13:00');
  assert.equal(await can(), false, 'horarios que se cruzan: choque');
  await rpc(U.liderCamp, `select public.mark_absent($1, $2)`, [evX, U.vX]);   // su propio grupo sirve ese día, pero él no va
  assert.equal(await can(), true, 'si no va a su propio servicio, queda libre para apoyar');
  await rpc(U.liderCamp, `select public.unmark_absent($1, $2)`, [evX, U.vX]);
  assert.equal(await can(), false);
  // Quien ya apoya en un horario que se cruza no puede apoyar en otro igual
  await setTimes(slotAm, '07:30', '08:00', '10:00');
  await rpc(U.liderCamp, `select public.add_supporter($1, $2)`, [U.evR1, U.vX]);
  await setTimes(slotAm, '11:00', '11:30', '13:00');
  assert.equal(await count('service_supporters', `user_id = '${U.vX}'`), 1);
  await rpc(U.liderCamp, `select public.remove_supporter($1, $2)`, [U.evR1, U.vX]);
  // Se postula sin choque; cuando se va a aprobar ya tiene otro servicio que se cruza: no se aprueba
  await setTimes(slotAm, '07:30', '08:00', '10:00');
  const rq = (await rpc(U.cR1, `select public.create_support_request($1, 1, null, '{}'::uuid[]) id`, [U.evR1]))[0].id;
  await rpc(U.vX, `select public.apply_to_request($1)`, [rq]);
  await setTimes(slotAm, '11:00', '11:30', '13:00');
  const appX = (await one(`select id from public.support_applications where user_id = $1`, [U.vX])).id;
  await denied(() => rpc(U.cR1, `select public.decide_application($1, true)`, [appX]), /ya no puede apoyar/);
  await rpc(U.cR1, `select public.cancel_support_request($1)`, [rq]);
  await setTimes(U.slotCamp, null, null, null); await setTimes(slotAm, null, null, null);
});

test('fase 7 · solicitud de apoyo: la ven solo quienes pueden apoyar; postulación, aprobación, cupo y cierre', async () => {
  // vR2 y sR3 ya eran apoyos directos: se liberan para probar la postulación
  for (const u of [U.vR2, U.sR3]) await rpc(U.cR1, `select public.remove_supporter($1, $2)`, [U.evR1, u]);
  const req = (uid, n = 2, note = 'Faltan manos', pos = [U.pCV1]) => rpc(uid, `select public.create_support_request($1, $2, $3, $4::uuid[]) id`, [U.evR1, n, note, pos]);
  await denied(() => req(U.vR1), /No tienes permiso/);
  await denied(() => req(U.cR2), /No tienes permiso/);
  await denied(() => req(U.cR1, 0), /check/);
  await denied(() => req(U.cR1, 51), /check/);
  await denied(() => req(U.cR1, 2, 'x', [U.posVol]), /no es de la sede/);
  const id = (await req(U.cR1, 2))[0].id;
  await denied(() => req(U.sR1), /ya tiene una solicitud de apoyo abierta/);

  const open = (uid) => rpc(uid, `select * from public.open_support_requests()`);
  const seenBy = {};
  for (const n of ['vR1', 'cR1', 'cR2', 'vR2', 'vR4', 'vR5', 'sR3', 'vol1', 'volSuba']) seenBy[n] = (await open(U[n])).length;
  assert.deepEqual(seenBy, { vR1: 0, cR1: 0, cR2: 0, vR2: 1, vR4: 1, vR5: 1, sR3: 1, vol1: 0, volSuba: 0 },
    'la ven voluntarios y supervisores de otros grupos de la sede; no su grupo, ni coordinadores, ni otras sedes');
  const r = (await open(U.vR4))[0];
  assert.equal(r.group_name, 'R1');
  assert.equal(r.needed, 2);
  assert.equal(r.filled, 0);
  assert.deepEqual(r.position_names, ['C1 · Entrada']);
  assert.deepEqual(Object.keys(r).sort(), ['application_id', 'day', 'filled', 'group_name', 'my_status', 'needed', 'note', 'position_names', 'request_id', 'service_date', 'shift', 'site_name', 'start_time']);

  const apply = (uid) => rpc(uid, `select public.apply_to_request($1)`, [id]);
  await denied(() => apply(U.vR1), /No puedes apoyar/);
  await denied(() => apply(U.cR2), /No puedes apoyar/);
  await denied(() => apply(U.vol1), /No puedes apoyar/);
  await apply(U.vR4);
  await denied(() => apply(U.vR4), /Ya te postulaste/);
  await apply(U.vR5);
  await apply(U.sR3);
  assert.equal((await open(U.vR4))[0].my_status, 'pendiente');
  assert.equal(await as(U.vR4, () => count('support_applications')), 1, 'cada quien ve solo su postulación');
  assert.equal(await as(U.vR1, () => count('support_applications')), 0);
  assert.equal(await as(U.cR1, () => count('support_applications', `request_id = '${id}'`)), 3, 'quien planifica ve todas');

  const apps = await rpc(U.cR1, `select * from public.request_applications($1)`, [id]);
  assert.deepEqual(apps.map((a) => a.full_name).sort(), ['sR3', 'vR4', 'vR5']);
  assert.deepEqual(Object.keys(apps[0]).sort(), ['created_at', 'full_name', 'group_name', 'id', 'role', 'status', 'user_id']);
  await denied(() => rpc(U.vR4, `select * from public.request_applications($1)`, [id]), /No tienes permiso/);
  await denied(() => rpc(U.cR2, `select * from public.request_applications($1)`, [id]), /No tienes permiso/);

  const appOf = (n) => apps.find((a) => a.full_name === n).id;
  const decide = (uid, a, ok) => rpc(uid, `select public.decide_application($1, $2)`, [a, ok]);
  await denied(() => decide(U.vR4, appOf('vR5'), true), /No tienes permiso/);
  await denied(() => decide(U.cR2, appOf('vR5'), true), /No tienes permiso/);
  await decide(U.cR1, appOf('vR4'), true);
  assert.deepEqual(await one(`select source, request_id = $2 as ok from public.service_supporters where user_id = $1 and event_id = $3`, [U.vR4, id, U.evR1]), { source: 'solicitud', ok: true });
  assert.equal((await one(`select public.support_filled($1) n`, [id])).n, 1);
  await denied(() => decide(U.cR1, appOf('vR4'), true), /ya fue atendida/);
  // Cupo: el supervisor de otro grupo (sR3 ya es apoyo directo) no cuenta; aprobar a vR5 llena la solicitud (2 de 2)
  await decide(U.sR1, appOf('vR5'), true);
  assert.equal((await one(`select public.support_filled($1) n`, [id])).n, 2);
  await denied(() => decide(U.cR1, appOf('sR3'), true), /ya no está abierta/);   // no se pasa del cupo
  assert.equal((await open(U.vR2)).length, 0, 'llena: ya no aparece para quien no se postuló');
  assert.equal((await open(U.vR5))[0].my_status, 'aprobada', 'quien se postuló la sigue viendo');
  await denied(() => apply(U.vR2), /ya no está abierta/);

  // Un apoyo aprobado se retira solo (hasta el día anterior) y la vacante se reabre
  await rpc(U.vR5, `select public.remove_supporter($1, $2)`, [U.evR1, U.vR5]);
  assert.equal((await one(`select status from public.support_applications where user_id = $1`, [U.vR5])).status, 'retirada');
  assert.equal((await one(`select public.support_filled($1) n`, [id])).n, 1);
  assert.equal((await open(U.vR2)).length, 1, 'se reabrió');
  await denied(() => rpc(U.vR4, `select public.remove_supporter($1, $2)`, [U.evR1, U.vR2]), /No tienes permiso/, 'nadie quita a otro');
  // El día del servicio ya no se retira solo
  const origDate = (await one(`select service_date::text d from public.service_events where id = $1`, [U.evR1])).d;
  await db.query(`update public.service_events set service_date = public.today_co() where id = $1`, [U.evR1]);
  await denied(() => rpc(U.vR4, `select public.remove_supporter($1, $2)`, [U.evR1, U.vR4]), /avisa a tu coordinador/);
  await rpc(U.cR1, `select public.remove_supporter($1, $2)`, [U.evR1, U.vR4]);       // quien planifica sí
  await db.query(`update public.service_events set service_date = $2 where id = $1`, [U.evR1, origDate]);
  // Volver a postularse tras retirarse; rechazar; cancelar la solicitud
  await apply(U.vR5);
  await apply(U.vR2);
  const apps2 = await rpc(U.cR1, `select * from public.request_applications($1)`, [id]);
  await decide(U.cR1, apps2.find((a) => a.full_name === 'vR2').id, false);
  assert.equal((await one(`select status from public.support_applications where user_id = $1`, [U.vR2])).status, 'rechazada');
  await denied(() => apply(U.vR2), /Ya te postulaste/, 'una postulación rechazada no se repite');
  await denied(() => rpc(U.vR4, `select public.cancel_support_request($1)`, [id]), /No tienes permiso/);
  await rpc(U.cR1, `select public.cancel_support_request($1)`, [id]);
  assert.equal((await one(`select status from public.support_applications where user_id = $1`, [U.vR5])).status, 'rechazada', 'al cancelar, lo pendiente se rechaza');
  assert.equal((await open(U.vR4)).length, 0);
  const id2 = (await req(U.liderCamp, 1, null, []))[0].id;
  assert.ok(id2 && id2 !== id, 'tras cancelar se puede pedir de nuevo');
});

test('fase 7 · el grupo de origen se entera; nadie escribe directo en las tablas; limpieza al cambiar de grupo o salir', async () => {
  await rpc(U.cR1, `select public.add_supporter($1, $2)`, [U.evR1, U.vR2]);
  await as(U.cR1, () => db.query(`insert into public.service_assignments (event_id, position_id, user_id) values ($1, $2, $3)`, [U.evR1, U.pCV2, U.vR2]));
  const out = (uid, g) => rpc(uid, `select * from public.outgoing_supports($1)`, [g]);
  const list = await out(U.cR2, U.gR2);
  assert.deepEqual(list.map((r) => r.full_name), ['vR2'], 'el coordinador de R2 ve que vR2 apoya a otro grupo');
  assert.equal(list[0].to_group_name, 'R1');
  assert.equal((await out(U.liderCamp, U.gR2)).length, 1);
  assert.equal((await out(U.admin, U.gR2)).length, 1);
  await denied(() => out(U.cR1, U.gR2), /No tienes permiso/);
  await denied(() => out(U.vR2, U.gR2), /No tienes permiso/);
  await denied(() => out(U.liderNogal2, U.gR2), /No tienes permiso/);

  for (const t of ['service_absences', 'support_requests', 'support_request_positions', 'support_applications', 'service_supporters']) {
    await denied(() => as(U.admin, () => db.query(`delete from public.${t}`)), /permission denied/);
    await denied(() => as(U.cR1, () => db.query(`update public.${t} set created_at = now()`).catch((e) => { throw e; })), /permission denied|column/);
  }
  await denied(() => as(U.vR2, () => db.query(`insert into public.service_supporters (event_id, user_id, source) values ($1, $2, 'directo')`, [U.evR1, U.vR4])), /permission denied/);
  await denied(() => as(U.vR2, () => db.query(`insert into public.service_absences (event_id, user_id) values ($1, $2)`, [U.evR1, U.vR1])), /permission denied/);
  await db.exec(`set role anon`);
  try {
    for (const f of ['open_support_requests()', `support_candidates('${U.evR1}', '')`, `add_supporter('${U.evR1}', '${U.vR4}')`, `event_people('${U.evR1}')`, `outgoing_supports('${U.gR2}')`])
      await denied(() => db.query(`select * from public.${f}`), /permission denied/);
  } finally { await db.exec(`reset role`); }

  // Quitar a un apoyo le quita sus posiciones; cambiar de grupo o hacerse coordinador le quita los apoyos futuros
  assert.equal(await count('service_assignments', `event_id = '${U.evR1}' and user_id = '${U.vR2}'`), 1);
  await rpc(U.cR1, `select public.remove_supporter($1, $2)`, [U.evR1, U.vR2]);
  assert.equal(await count('service_assignments', `event_id = '${U.evR1}' and user_id = '${U.vR2}'`), 0, 'sin apoyo no queda posición');
  await rpc(U.cR1, `select public.add_supporter($1, $2)`, [U.evR1, U.vR2]);
  await db.query(`update public.memberships set group_id = $2 where user_id = $1`, [U.vR2, U.gR4]);
  assert.equal(await count('service_supporters', `user_id = '${U.vR2}'`), 0, 'al cambiar de grupo se pierden sus apoyos futuros');
  await rpc(U.cR1, `select public.add_supporter($1, $2)`, [U.evR1, U.sR3]);
  assert.equal(await count('service_supporters', `user_id = '${U.sR3}'`), 1);
  await as(U.sR3, () => db.query(`select public.delete_my_account()`));
  assert.equal(await count('service_supporters', `user_id = '${U.sR3}'`), 0, 'al darse de baja, todo se va con la cuenta');
});

// ───────────── Fase 8 · Conteos y totales (Campestre) ─────────────
const saveCounts = (uid, ev, arr) => rpc(uid, `select public.save_counts($1, $2::jsonb)`, [ev, JSON.stringify(arr)]);
const totalsOf = async (ev) => Object.fromEntries((await rows(`select l.name, c.total from public.service_counts c join public.locations l on l.id = c.location_id where c.event_id = $1 order by l.name`, [ev])).map((r) => [r.name, r.total]));

test('fase 8 · capacidad: la fija el líder de la sede; no puede quedar por debajo de un conteo registrado', async () => {
  const locs = await rows(`select id, name from public.locations where site_id = $1 order by sort, name`, [U.sCamp]);
  U.locA = locs[0].id; U.locB = locs[1].id; U.locNameA = locs[0].name; U.locNameB = locs[1].name;
  U.locCas = (await one(`select id from public.locations where site_id = $1 order by sort limit 1`, [U.sCas])).id;
  const cap = (uid, loc, n) => as(uid, async () => (await db.query(`update public.locations set capacity = $2 where id = $1`, [loc, n])).affectedRows);
  assert.equal(await cap(U.liderCamp, U.locA, 500), 1);
  assert.equal(await cap(U.admin, U.locB, 120), 1);
  assert.equal(await cap(U.vR1, U.locA, 1), 0, 'un voluntario no cambia la capacidad');
  assert.equal(await cap(U.cR1, U.locA, 1), 0, 'ni un coordinador');
  assert.equal(await cap(U.liderNogal2, U.locA, 1), 0, 'ni el líder de otra sede');
  await denied(() => cap(U.liderCamp, U.locA, -1), /check/);
  await denied(() => cap(U.liderCamp, U.locA, 100001), /check/);
  assert.equal((await one(`select capacity from public.locations where id = $1`, [U.locA])).capacity, 500);
  assert.equal(await cap(U.admin, U.locCas, 800), 1);
});

test('fase 8 · guía de conteo: una por sede y día; la ven quienes sirven ese día y los líderes; solo el líder la carga', async () => {
  const put = (uid, site, day, path) => as(uid, () => db.query(`insert into public.count_guides (site_id, day, image_path) values ($1, $2, $3) on conflict (site_id, day) do update set image_path = excluded.image_path`, [site, day, path]));
  await put(U.liderCamp, U.sCamp, 'domingo', 'campestre/domingo/g1.png');
  await put(U.liderCamp, U.sCamp, 'domingo', 'campestre/domingo/g2.png');      // reemplazar
  await put(U.admin, U.sCamp, 'sabado', 'campestre/sabado/g1.png');
  await denied(() => put(U.cR1, U.sCamp, 'miercoles', 'campestre/miercoles/x.png'), /row-level security/);
  await denied(() => put(U.liderNogal2, U.sCamp, 'miercoles', 'campestre/miercoles/x.png'), /row-level security/);
  await denied(() => put(U.liderCamp, U.sCas, 'domingo', 'castellana/domingo/x.png'), /row-level security/);
  assert.equal(await count('count_guides', `site_id = '${U.sCamp}'`), 2, 'una por sede y día');
  // Quién ve cada una: el grupo R1 sirve el domingo de Campestre; nadie de él sirve el sábado
  const seen = async (uid) => (await as(uid, () => rows(`select day from public.count_guides where site_id = $1 order by day`, [U.sCamp]))).map((r) => r.day);
  assert.deepEqual(await seen(U.vR1), ['domingo'], 'el grupo que sirve ese día');
  assert.deepEqual(await seen(U.cR1), ['domingo']);
  assert.deepEqual(await seen(U.liderCamp), ['sabado', 'domingo']);
  assert.deepEqual(await seen(U.admin), ['sabado', 'domingo']);
  assert.deepEqual(await seen(U.cabeza), ['sabado', 'domingo']);
  assert.deepEqual(await seen(U.vol1), [], 'otra sede');
  assert.deepEqual(await seen(U.liderNogal2), []);
  assert.deepEqual(await seen(U.vX), ['domingo'], 'quien sirve ese día en otro horario de la sede también');
  // Storage
  const obj = (uid, path) => as(uid, () => db.query(`insert into storage.objects (bucket_id, name) values ('counts', $1)`, [path]));
  await obj(U.liderCamp, 'campestre/domingo/g2.png');
  await denied(() => obj(U.cR1, 'campestre/domingo/y.png'), /row-level security/);
  await denied(() => obj(U.liderNogal2, 'campestre/domingo/y.png'), /row-level security/);
  await denied(() => obj(U.liderCamp, 'castellana/domingo/y.png'), /row-level security/);
  const vis = (uid) => as(uid, async () => (await one(`select count(*)::int n from storage.objects where bucket_id = 'counts'`)).n);
  assert.equal(await vis(U.vR1), 1);
  assert.equal(await vis(U.vol1), 0);
  assert.equal(await vis(U.liderNogal2), 0);
  assert.equal((await one(`select public from storage.buckets where id = 'counts'`)).public, false);
});

test('fase 8 · captura: quién, cuándo (desde el día; plazo de 24 horas), validación contra la capacidad, todo o nada', async () => {
  const mk = async (offset) => (await one(`insert into public.service_events (slot_id, service_date, group_id, kind, turn) values ($1, public.today_co() + $2::int, $3, 'rotacion', 0) returning id`, [U.slotCamp, offset, U.gR1])).id;
  U.evToday = await mk(0); U.evYest = await mk(-1); U.evOld = await mk(-2); U.evFut = await mk(1);
  const ok = [{ location_id: U.locA, total: 300 }, { location_id: U.locB, total: 100 }];

  // Quién
  await denied(() => saveCounts(U.vR1, U.evToday, ok), /No puedes registrar/);                 // un voluntario no
  await denied(() => saveCounts(U.cR2, U.evToday, ok), /No puedes registrar/);                 // coordinador de otro grupo
  await denied(() => saveCounts(U.liderNogal2, U.evToday, ok), /No puedes registrar/);
  await denied(() => saveCounts(U.vol1, U.evToday, ok), /No puedes registrar/);
  await saveCounts(U.sR1, U.evToday, ok);                                                       // un supervisor del grupo sí
  assert.deepEqual(await totalsOf(U.evToday), { [U.locNameA]: 300, [U.locNameB]: 100 });
  // Cuándo
  await denied(() => saveCounts(U.cR1, U.evFut, ok), /No puedes registrar/, 'antes del día del servicio no');
  await denied(() => saveCounts(U.liderCamp, U.evFut, ok), /No puedes registrar/);
  await saveCounts(U.cR1, U.evYest, ok);                                                        // ayer: dentro del plazo
  await denied(() => saveCounts(U.cR1, U.evOld, ok), /No puedes registrar/, 'pasadas las 24 horas, el coordinador ya no');
  await denied(() => saveCounts(U.sR1, U.evOld, ok), /No puedes registrar/);
  await saveCounts(U.liderCamp, U.evOld, ok);                                                   // el líder sí
  await saveCounts(U.admin, U.evOld, [{ location_id: U.locA, total: 310 }]);                    // y el administrador
  assert.equal((await totalsOf(U.evOld))[U.locNameA], 310);

  // Validación contra la capacidad (500 y 120): nunca se supera
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locB, total: 121 }]), /no puede superar su capacidad \(120\)/);
  await saveCounts(U.cR1, U.evToday, [{ location_id: U.locB, total: 120 }]);                    // el límite exacto se permite
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locA, total: -1 }]), /número entero/);
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locA, total: 1.5 }]), /número entero/);
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locA, total: '12' }]), /número entero/);
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: 'no-es-uuid', total: 1 }]), /no son válidos/);
  await denied(() => saveCounts(U.cR1, U.evToday, { location_id: U.locA, total: 1 }), /no son válidos/);
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locCas, total: 1 }]), /no es de la sede/, 'ubicación de otra sede');
  // Una ubicación sin capacidad registrada no admite conteo
  const locC = (await one(`insert into public.locations (site_id, name, kind) values ($1, 'Salón sin capacidad', 'salon') returning id`, [U.sCamp])).id;
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: locC, total: 5 }]), /no tiene su capacidad registrada/);
  // Todo o nada
  await denied(() => saveCounts(U.cR1, U.evToday, [{ location_id: U.locA, total: 1 }, { location_id: U.locB, total: 999 }]), /no puede superar/);
  assert.equal((await totalsOf(U.evToday))[U.locNameA], 300, 'si uno falla, no se guarda ninguno');
  // Parcial, y un total nulo lo borra
  await saveCounts(U.cR1, U.evToday, [{ location_id: U.locA, total: 280 }]);
  assert.deepEqual(await totalsOf(U.evToday), { [U.locNameA]: 280, [U.locNameB]: 120 });
  await saveCounts(U.cR1, U.evToday, [{ location_id: U.locB, total: null }]);
  assert.deepEqual(await totalsOf(U.evToday), { [U.locNameA]: 280 });
  // Un servicio cancelado o sin grupo no tiene conteos
  const canc = (await one(`insert into public.service_events (slot_id, service_date, group_id, kind, turn) values ($1, public.today_co() - 5, $2, 'rotacion', 0) returning id`, [U.slotCamp, U.gR1])).id;
  await db.query(`insert into public.service_cancellations (service_date, site_id, slot_id) values (public.today_co() - 5, $1, $2)`, [U.sCamp, U.slotCamp]);
  await denied(() => saveCounts(U.liderCamp, canc, ok), /No puedes registrar/);
  // Restricciones directas de la tabla
  await denied(() => as(U.liderCamp, () => db.query(`insert into public.service_counts (event_id, location_id, total) values ($1, $2, 1)`, [U.evToday, U.locA])), /permission denied/);
  await denied(() => as(U.admin, () => db.query(`update public.service_counts set total = 1`)), /permission denied/);
  await denied(() => as(U.admin, () => db.query(`delete from public.service_counts`)), /permission denied/);
  // La base de datos también lo impide si se intenta por debajo de las funciones
  await denied(() => db.query(`update public.service_counts set total = 501 where event_id = $1 and location_id = $2`, [U.evToday, U.locA]), /no puede superar su capacidad/);
});

test('fase 8 · quién ve los totales y el historial de cambios; la capacidad no baja de lo ya contado', async () => {
  const mine = (uid) => as(uid, () => count('service_counts'));
  const total = await count('service_counts');
  assert.equal(await mine(U.admin), total);
  assert.equal(await mine(U.cabeza), total);
  assert.equal(await mine(U.liderCamp), total, 'el líder ve los de su sede');
  assert.ok(await mine(U.cR1) >= 3, 'el coordinador ve los de su grupo');
  assert.equal(await mine(U.sR1), await mine(U.cR1), 'y el supervisor también');
  assert.equal(await mine(U.cR2), 0, 'otro grupo no');
  assert.equal(await mine(U.vR1), 0, 'un voluntario no ve totales');
  assert.equal(await mine(U.vol1), 0);
  assert.equal(await mine(U.liderNogal2), 0, 'el líder de otra sede no');
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select * from public.service_counts`), /permission denied/); } finally { await db.exec(`reset role`); }

  // Historial: quién cambió qué y cuándo (solo líder, cabeza, administrador)
  const log = await rpc(U.liderCamp, `select * from public.count_log($1)`, [U.evToday]);
  assert.ok(log.length >= 4);
  assert.deepEqual(Object.keys(log[0]).sort(), ['changed_at', 'full_name', 'location_name', 'new_total', 'old_total']);
  assert.ok(log.some((l) => l.old_total === 300 && l.new_total === 280), 'registra el valor anterior y el nuevo');
  assert.ok(log.some((l) => l.new_total === null && l.old_total === 120), 'y los borrados');
  assert.ok(log.every((l) => l.full_name), 'con quién lo cambió');
  await denied(() => rpc(U.cR1, `select * from public.count_log($1)`, [U.evToday]), /No tienes permiso/);
  await denied(() => rpc(U.liderNogal2, `select * from public.count_log($1)`, [U.evToday]), /No tienes permiso/);
  assert.equal(await as(U.cR1, () => count('service_count_log')), 0);
  assert.ok(await as(U.liderCamp, () => count('service_count_log')) >= 4);

  // La capacidad no puede bajar de un conteo ya registrado (sí subir)
  const maxA = Number((await one(`select max(total)::int m from public.service_counts where location_id = $1`, [U.locA])).m);
  assert.ok(maxA > 0);
  await denied(() => as(U.liderCamp, () => db.query(`update public.locations set capacity = $2 where id = $1`, [U.locA, maxA - 1])), /la capacidad no puede ser menor/);
  await denied(() => as(U.liderCamp, () => db.query(`update public.locations set capacity = null where id = $1`, [U.locA])), /la capacidad no puede ser menor/);
  await as(U.liderCamp, () => db.query(`update public.locations set capacity = $2 where id = $1`, [U.locA, maxA]));
  await as(U.liderCamp, () => db.query(`update public.locations set capacity = 500 where id = $1`, [U.locA]));
  // Al eliminar el servicio se van sus totales y su historial; al eliminar a quien contó, el total queda sin nombre
  const before = await count('service_counts');
  await db.query(`delete from public.service_events where id = $1`, [U.evOld]);
  assert.ok(await count('service_counts') < before);
  assert.equal(await count('service_count_log', `event_id = '${U.evOld}'`), 0);
  await saveCounts(U.sR1, U.evToday, [{ location_id: U.locB, total: 50 }]);
  await as(U.sR1, () => db.query(`select public.delete_my_account()`));
  assert.ok(await count('service_counts', `counted_by is null`) >= 1, 'los totales no son datos personales: se conservan sin nombre');
});

// ───────────── Fase 9 · Avisos al teléfono ─────────────
const asServer = async (fn) => { await db.exec(`set role service_role`); try { return await fn(); } finally { await db.exec(`reset role`); } };
const sub = (uid, ep, extra = {}) => rpc(uid, `select public.save_push_subscription($1, $2, $3)`, [ep, extra.p256dh ?? 'BKey', extra.auth ?? 'authKey']);

test('fase 9 · dispositivos: cada quien ve y quita los suyos; un dispositivo pasa a quien inicia sesión; máximo 10', async () => {
  await sub(U.vR4, 'https://push.example/dev-a');
  assert.equal(await as(U.vR4, () => count('push_subscriptions')), 1);
  assert.equal(await as(U.vR5, () => count('push_subscriptions')), 0, 'nadie ve los dispositivos de otro');
  assert.equal(await as(U.admin, () => count('push_subscriptions')), 0, 'ni el administrador');
  // El mismo navegador usado por otra persona: el aviso pasa a ella
  await sub(U.vR5, 'https://push.example/dev-a', { auth: 'otra' });
  assert.equal(await as(U.vR4, () => count('push_subscriptions')), 0);
  assert.equal(await as(U.vR5, () => count('push_subscriptions')), 1);
  assert.equal((await one(`select auth from public.push_subscriptions where endpoint = 'https://push.example/dev-a'`)).auth, 'otra');
  // Validaciones y permisos
  await denied(() => sub(U.vR4, 'http://sin-https.example/x'), /check/);
  await denied(() => sub(U.vR4, 'https://push.example/' + 'x'.repeat(1001)), /check/);
  await denied(() => sub(U.vR4, 'https://push.example/ok', { p256dh: '' }), /check/);
  await denied(() => as(U.vR4, () => db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://x.example/1', 'a', 'b')`, [U.vR4])), /permission denied/);
  await denied(() => as(U.vR4, () => db.query(`update public.push_subscriptions set user_id = $1`, [U.vR4])), /permission denied/);
  await db.exec(`set role anon`);
  try { await denied(() => db.query(`select public.save_push_subscription('https://a.example/1', 'a', 'b')`), /permission denied/); } finally { await db.exec(`reset role`); }
  // Quitar: solo los propios
  await rpc(U.vR4, `select public.remove_push_subscription('https://push.example/dev-a')`);
  assert.equal(await count('push_subscriptions', `endpoint = 'https://push.example/dev-a'`), 1, 'no quita el de otra persona');
  assert.equal(await as(U.vR4, async () => (await db.query(`delete from public.push_subscriptions where endpoint = 'https://push.example/dev-a'`)).affectedRows), 0, 'ni borrándolo directamente');
  assert.equal(await as(U.vR5, async () => (await db.query(`delete from public.push_subscriptions where endpoint = 'https://push.example/dev-a'`)).affectedRows), 1, 'cada quien quita el suyo');
  // Máximo 10 por persona: se conservan los más recientes
  for (let i = 1; i <= 12; i++) { await sub(U.vR4, `https://push.example/m${i}`); await db.query(`update public.push_subscriptions set created_at = now() - ($2 || ' seconds')::interval where endpoint = $1`, [`https://push.example/m${i}`, String(20 - i)]); }
  await sub(U.vR4, 'https://push.example/m13');
  const keep = (await rows(`select endpoint from public.push_subscriptions where user_id = $1`, [U.vR4])).map((r) => r.endpoint);
  assert.equal(keep.length, 10);
  assert.ok(keep.includes('https://push.example/m13') && !keep.includes('https://push.example/m1'), 'se van los más antiguos');
  await db.query(`delete from public.push_subscriptions where endpoint like 'https://push.example/m%'`);
});

test('fase 9 · preferencias de avisos: cada quien las suyas', async () => {
  await as(U.vR5, () => db.query(`insert into public.notification_prefs (user_id, support_requests) values ($1, false)`, [U.vR5]));
  assert.deepEqual(await as(U.vR5, () => one(`select support_requests, pending_counts from public.notification_prefs`)), { support_requests: false, pending_counts: true });
  await as(U.vR5, () => db.query(`update public.notification_prefs set pending_counts = false where user_id = $1`, [U.vR5]));
  await denied(() => as(U.vR4, () => db.query(`insert into public.notification_prefs (user_id) values ($1)`, [U.vR5])), /row-level security/);
  assert.equal(await as(U.vR4, () => count('notification_prefs')), 0, 'nadie ve las de otra persona');
  assert.equal(await as(U.vR4, async () => (await db.query(`update public.notification_prefs set support_requests = true`)).affectedRows), 0);
  assert.equal(await as(U.admin, () => count('notification_prefs')), 0);
  await denied(() => as(U.vR4, () => db.query(`select * from public.notification_log`)), /permission denied/);
  await db.query(`delete from public.notification_prefs`);
});

test('fase 9 · a quién se avisa: solicitud de apoyo (puede apoyar, con dispositivo y sin desactivarlo) y conteos pendientes (coordinador o supervisor)', async () => {
  // — Solicitud de apoyo —
  await db.query(`update public.support_requests set status = 'cancelada' where event_id = $1`, [U.evToday]);
  await db.query(`delete from public.service_supporters where event_id = $1`, [U.evToday]);
  const rq = (await rpc(U.cR1, `select public.create_support_request($1, 2, null, '{}'::uuid[]) id`, [U.evToday]))[0].id;
  // Elegibles según la regla de apoyo (la misma que usa la solicitud)
  const eligible = (await rows(`select m.user_id from public.memberships m where m.role in ('voluntario', 'supervisor') and public.can_support_event(m.user_id, $1)`, [U.evToday])).map((r) => r.user_id);
  assert.ok(eligible.includes(U.vR4) && eligible.includes(U.vR5), 'hay personas elegibles para la prueba');
  const aud = () => asServer(async () => (await rows(`select * from public.support_request_audience($1)`, [rq])).map((r) => r.user_id));
  assert.deepEqual(await aud(), [], 'sin dispositivos no hay a quién avisar');
  await sub(U.vR4, 'https://push.example/r4'); await sub(U.vR5, 'https://push.example/r5'); await sub(U.vR1, 'https://push.example/r1'); await sub(U.cR2, 'https://push.example/c2');
  assert.deepEqual((await aud()).sort(), [U.vR4, U.vR5].sort(), 'solo quienes pueden apoyar y tienen dispositivo (no su propio grupo ni coordinadores)');
  const row = (await asServer(() => rows(`select * from public.support_request_audience($1) limit 1`, [rq])))[0];
  assert.deepEqual(Object.keys(row).sort(), ['filled', 'group_name', 'needed', 'service_date', 'site_name', 'user_id'], 'sin nombres ni correos');
  assert.equal(row.group_name, 'R1');
  await db.query(`insert into public.notification_prefs (user_id, support_requests) values ($1, false)`, [U.vR5]);
  assert.deepEqual(await aud(), [U.vR4], 'quien desactivó este aviso no lo recibe');
  await db.query(`update public.support_requests set status = 'cancelada' where id = $1`, [rq]);
  assert.deepEqual(await aud(), [], 'una solicitud cancelada no avisa');
  await denied(() => as(U.cR1, () => db.query(`select * from public.support_request_audience($1)`, [rq])), /permission denied/);
  await denied(() => as(U.admin, () => db.query(`select * from public.pending_counts_audience()`)), /permission denied/);
  await denied(() => as(U.vR4, () => db.query(`select public.claim_notification($1, 'x', $2, false)`, [U.vR4, rq])), /permission denied/);

  // — Conteos pendientes —
  await db.query(`delete from public.service_counts where event_id in ($1, $2)`, [U.evYest, U.evToday]);
  await sub(U.cR1, 'https://push.example/c1');
  const pend = () => asServer(() => rows(`select user_id, event_id from public.pending_counts_audience()`));
  const p1 = await pend();
  assert.ok(p1.some((r) => r.user_id === U.cR1 && r.event_id === U.evYest) && p1.some((r) => r.user_id === U.cR1 && r.event_id === U.evToday), 'el coordinador recibe los pendientes de hoy y de ayer');
  assert.ok(!p1.some((r) => r.user_id === U.vR1 || r.user_id === U.cR2 || r.user_id === U.vR4), 'ni voluntarios ni otros grupos');
  assert.ok(!p1.some((r) => r.event_id === U.evFut), 'ni servicios futuros');
  await db.query(`insert into public.service_counts (event_id, location_id, total) values ($1, $2, 10)`, [U.evYest, U.locA]);
  assert.ok(!(await pend()).some((r) => r.event_id === U.evYest), 'con algún total registrado ya no es pendiente');
  await db.query(`insert into public.notification_prefs (user_id, pending_counts) values ($1, false)`, [U.cR1]);
  assert.ok(!(await pend()).some((r) => r.user_id === U.cR1), 'quien lo desactivó no lo recibe');
  await db.query(`delete from public.notification_prefs where user_id = $1`, [U.cR1]);
  await db.query(`update public.service_events set service_date = public.today_co() - 2 where id = $1`, [U.evToday]);
  assert.ok(!(await pend()).some((r) => r.event_id === U.evToday), 'pasado el plazo (más de 1 día) ya no se avisa');
  await db.query(`update public.service_events set service_date = public.today_co() where id = $1`, [U.evToday]);

  // — Que no se repita —
  const claim = (u, kind, ref, daily) => asServer(async () => (await one(`select public.claim_notification($1, $2, $3, $4) ok`, [u, kind, ref, daily])).ok);
  assert.equal(await claim(U.vR4, 'support_request', rq, false), true);
  assert.equal(await claim(U.vR4, 'support_request', rq, false), false, 'una solicitud se avisa una sola vez por persona');
  assert.equal(await claim(U.vR5, 'support_request', rq, false), true);
  assert.equal(await claim(U.cR1, 'pending_counts', U.evToday, true), true);
  assert.equal(await claim(U.cR1, 'pending_counts', U.evToday, true), false, 'los conteos, una vez al día');
  assert.equal((await one(`select (sent_on = public.today_co()) as hoy from public.notification_log where kind = 'pending_counts' limit 1`)).hoy, true, 'el aviso diario se anota con la fecha de hoy');
  await db.query(`update public.notification_log set sent_on = sent_on - 1 where kind = 'pending_counts'`);
  assert.equal(await claim(U.cR1, 'pending_counts', U.evToday, true), true, 'y otra vez al día siguiente');
  // Todo se va con la cuenta
  await as(U.vR4, () => db.query(`select public.delete_my_account()`));
  assert.equal(await count('push_subscriptions', `user_id = '${U.vR4}'`), 0);
  assert.equal(await count('notification_log', `user_id = '${U.vR4}'`), 0);
});
