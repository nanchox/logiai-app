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
  await denied(() => as(U.admin, () => db.query(`insert into public.profiles (user_id, email) values (gen_random_uuid(), 'zz@x.com')`)), /permission denied|row-level security|violates/);
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
