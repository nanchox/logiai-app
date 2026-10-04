-- LogiAI · Fase 1 · Carga inicial (generada con scripts/generate-seed.mjs desde legacy/index.html)
-- Sedes, auditorios/salones, mapa y posiciones de Castellana · Auditorio principal, y correos de arranque.
-- Las imágenes se suben después con: npx tsx --env-file=.env.local scripts/upload-seed-assets.ts

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

-- Castellana · Auditorio principal: zonas 1 a 6, mapas y posiciones
do $seed$
declare
  v_loc  uuid;
  v_zone uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id
   where s.slug = 'castellana' and l.name = 'Auditorio principal';

  insert into public.maps (location_id, zone_id, name, image_path, sort)
  values (v_loc, null, 'Mapa general', $q$castellana/auditorio-principal/general.png$q$, 0);

  for i in 1..6 loop
    insert into public.zones (location_id, name, kind, sort) values (v_loc, 'Zona ' || i, 'acomodacion', i) returning id into v_zone;
    insert into public.maps (location_id, zone_id, name, image_path, sort)
    values (v_loc, v_zone, 'Zona ' || i, 'castellana/auditorio-principal/zona-' || i || '.png', i);
  end loop;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, null, '1', $q$SUPERVISOR DERECHO$q$, 'supervisor', $q$Organiza a los voluntarios asignados a su zona. Responsable de supervisar que todos los voluntarios estén en su posición, que tengan conocimiento de las zonas, buena actitud, porte bien el uniforme con su botón y tengan los implementos necesarios. Realiza el check-in, revisa el manejo de lazos y conoce el número de sillas por zona. Conocedor de ingresos y salidas. Atento a reservas solicitadas. En lo espiritual, si discierne algo, pide oración a los voluntarios. Informa cualquier situación inusual al Coordinador.$q$, true, 1) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 25, 68 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 1'), 'desktop', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 1'), 'mobile', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'desktop', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'mobile', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'desktop', 40, 43;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'mobile', 40, 43;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 1'), '2', $q$PUESTO #2$q$, 'voluntario', $q$Responsable de la zona. Ubican a las personas de abajo hacia arriba. En fin de semana, zona reservada para papás SPK. Primeras filas para Staff o líderes según instrucción. Sostiene cuerda abajo de la zona al terminar la salida de zona 3. Coordina la salida por escalera interna. Dirige a nuevos y coloca carita feliz. Forros negros: uno en primera fila de abajo y otro en la mitad de la zona.$q$, true, 2) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 17, 76 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 1'), 'desktop', 25, 50;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 1'), 'mobile', 36, 49;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 2'), '3', $q$PUESTO #3$q$, 'voluntario', $q$ZONA 2 Abajo. Responsable de la zona. Quinta fila queda como fila de paso. Dirige asistentes hacia zona 1. Reserva sillas para alabanza y líderes. Dirige salida de nuevos. Coloca capas de lluvia en la primera silla de cada fila sobre rampa de Zona 1. Forros negros: uno en la primera fila y otro en la última fila de prioritarios. En la salida se ubica arriba sosteniendo lazo, dirigiendo de arriba hacia abajo (prioritarios primero).$q$, false, 3) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 27, 72 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'desktop', 27, 48;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'mobile', 36, 48;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 2'), '4', $q$PUESTO #4$q$, 'voluntario', $q$ZONA 2 Abajo. Apoya la acomodación. En la salida sostiene lazo en la parte de abajo. Coloca carita feliz a nuevos y dirige a las personas a su silla. Para la salida, se ubica arriba y saca las últimas 4 filas por la última fila de la zona 2; las demás salen por la escalera interna.$q$, false, 4) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 40, 74 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'desktop', 42, 51;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'mobile', 45, 51;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 2'), '5', $q$PUESTO #5$q$, 'voluntario', $q$ZONA 2 Arriba. RADIO. Responsable de la zona. Ingreso y ubicación de abajo hacia arriba. Atento a reserva de Traducción. Fines de semana reservado para papás SPKS. Coloca capas de lluvia en la primera silla de cada fila (orilla escalera). Tres forros negros: baranda, detrás del servidor y arriba paralelo a traducción. Dirige nuevos (carita feliz). En salida sostiene lazo abajo según indicación del Centro.$q$, false, 5) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 49, 77 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'desktop', 50, 53;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'mobile', 52, 59;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 2'), '6', $q$PUESTO #6$q$, 'voluntario', $q$ZONA 2 Arriba. Apoya el ingreso y ubicación de asistentes. En la salida sostiene el lazo para dirigir el flujo. Dirige salida de nuevos y coloca carita feliz.$q$, false, 6) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 62, 77 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'desktop', 77, 56;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 2'), 'mobile', 69, 68;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 3'), '7', $q$PUESTO #7$q$, 'voluntario', $q$ZONA 3 Lado Derecho. RADIO. Responsable de zona. Ubicación de abajo hacia arriba dirigiendo hacia la izquierda. Atento a reservas de Comité, Staff y líderes. Forros negros: dos en primera fila pastores, uno para servidor X y uno en baranda última fila. En salida sostiene lazo (arriba hacia abajo) por escalera interna, alternando filas a derecha e izquierda.$q$, false, 7) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 30, 67 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 34, 64;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 45, 70;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 3'), '8', $q$PUESTO #8$q$, 'voluntario', $q$ZONA 3 Lado Derecho. Apoya la logística de zona. Sostiene bandera al llamado de nuevos y los dirige a la posición Centro (Orientación) para llevarlos al Lobby. En la salida se ubica abajo de la zona sosteniendo el lazo.$q$, false, 8) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 38, 68 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 56, 66;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 52, 77;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 3'), '9', $q$PUESTO #9$q$, 'voluntario', $q$ZONA 3 Semáforo Escalera Derecha. Coordina salida a baños con puerta de vidrio para evitar doble vía en la escalera. Alterna subida y bajada. En la salida hace "la L" con el lazo para ampliar el flujo de asistentes.$q$, false, 9) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 44, 71 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 76, 73;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 59, 85;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 3'), '10', $q$PUESTO #10$q$, 'voluntario', $q$ZONA 3 Lado Izquierdo. RADIO. Responsable de zona. Atento a reservas del Supervisor. Primeras filas para líderes. Forros: uno en primera silla abajo y otro en baranda última fila. Dirige nuevos (carita feliz). En salida (arriba hacia abajo) sostiene lazo y alterna filas a derecha e izquierda. Sostiene bandera para nuevos hacia el Centro. Pendiente de salida de zona 5 hacia escalera interna.$q$, false, 10) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 33, 55 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 42, 37;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 47, 31;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 3'), '11', $q$PUESTO #11$q$, 'voluntario', $q$ZONA 3 Semáforo Escalera Izquierda. Coordina salida a baños con puerta de vidrio para evitar doble vía en la escalera. Alterna flujo de subida y bajada. En la salida hace "la L" con el lazo para ampliar el flujo.$q$, false, 11) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 43, 51 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'desktop', 77, 29;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 3'), 'mobile', 56, 26;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 4'), '12', $q$PUESTO #12$q$, 'voluntario', $q$ZONA 4 Lado Derecho. RADIO. Responsable de zona. Acomodación de abajo hacia arriba. Forros negros: uno en primera silla/fila y otro a mitad de zona paralelo a traducción. Capas de lluvia alternadas bajo la primera silla de cada fila. En salida sostiene cuerda abajo coordinando con el centro derecho. Alterna salida a derecha e izquierda por fila.$q$, false, 12) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 55, 70 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'desktop', 36, 69;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'mobile', 47, 80;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 4'), '13', $q$PUESTO #13$q$, 'voluntario', $q$ZONA 4 Lado Derecho. Apoya la logística de zona dirigiendo al asistente a su silla. Atento a salida de nuevos (guía y carita feliz). En salida sostiene el lazo en la parte de arriba.$q$, false, 13) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 65, 72 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'desktop', 53, 72;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'mobile', 55, 85;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 4'), '14', $q$PUESTO #14$q$, 'voluntario', $q$ZONA 4 Lado Izquierdo. RADIO. Responsable de zona. Ubicación de abajo hacia arriba. Coloca paquetes de capas de lluvia alternados bajo la primera fila. Forros negros: uno en primera silla/fila y otro a mitad de zona. Dirige nuevos y coloca carita feliz. En salida sostiene lazo abajo, alternando filas a derecha e izquierda.$q$, false, 14) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 53, 52 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'desktop', 38, 35;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'mobile', 48, 28;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 4'), '15', $q$PUESTO #15$q$, 'voluntario', $q$ZONA 4 Lado Izquierdo. Apoya la logística ubicando personas. Colabora con salida de nuevos y caritas felices. En la salida de la iglesia se ubica arriba para dirigir el flujo.$q$, false, 15) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 60, 50 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'desktop', 54, 32;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 4'), 'mobile', 55, 22;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, null, '16', $q$SUPERVISOR IZQUIERDO$q$, 'supervisor', $q$Responsable de confirmar voluntarios y asignar posiciones. Realiza check-in (implementos y presentación). Responsable de contadores. Supervisa fluidez en rampas, centros y caracol del lobby. Gestiona ingreso por puerta pequeña si hay pocos asistentes y flujo de filas Betel. Asegura chaquetas para voluntarios e ingreso de población prioritaria al lobby. Supervisa relevos para Casa Fuente y reporta situaciones al Coordinador. Supervisa salida de nuevos sin quitar parales hasta el final. Responsable de puestos 16 al 30.$q$, true, 16) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 25, 53 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 15, 40;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 15, 40;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 15, 40;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 15, 40;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '17', $q$PUESTO #17$q$, 'voluntario', $q$ZONA 5 Abajo. RADIO. Responsable de zona. Dirige asistentes por rampa sobre zona 6. Reserva sillas para líderes y prioritarios (sillas de ruedas en 1ra fila, acompañantes en 2da). Forros: uno en rampa izquierda y otro en prioridad. Capas bajo primera silla de fila en rampa izquierda. Dirige salida de nuevos (carita feliz). En salida sostiene lazo arriba dirigiendo de arriba hacia abajo (prioritarios primero).$q$, false, 17) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 30, 49 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 20, 74;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 38, 86;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '18', $q$PUESTO #18$q$, 'voluntario', $q$ZONA 5 Abajo. Apoya acomodación, reservas y ubicación de población prioritaria, sillas de ruedas y líderes (50 sillas). En salida sostiene lazo abajo. Apoya salida de nuevos hacia la rampa con caritas felices.$q$, false, 18) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 39, 48 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 35, 71;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 43, 82;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '19', $q$PUESTO #19$q$, 'voluntario', $q$ZONA 5. RADIO. Responsable de dirigir ingreso de abajo hacia arriba por la rampa. Tres forros negros: baranda (Centro), detrás de este y arriba junto a baranda. Capas de lluvia en rampa izquierda sobre zona 6. En salida sostiene lazo coordinando con el centro izquierdo. Dirige nuevos y coloca caritas felices.$q$, false, 19) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 45, 45 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 48, 65;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 49, 71;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '20', $q$PUESTO #20$q$, 'voluntario', $q$ZONA 5. Apoya el ingreso ubicando asistentes en su silla. En la salida sostiene el lazo para dirigir a las personas.$q$, false, 20) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 55, 42 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 60, 63;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 56, 66;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '21', $q$PUESTO #21$q$, 'voluntario', $q$ZONA 5 Arriba. RADIO. Responsable de zona. Ubicado abajo, dirige asistentes hacia arriba para ser acomodados. Forros: uno abajo paralelo a baranda y otro arriba cerca de la puerta. Coloca paquetes de capas bajo primeras sillas. En salida sostiene lazo abajo. Dirige nuevos hacia la rampa Betel con carita feliz.$q$, false, 21) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 49, 23 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 53, 34;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 52, 26;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '22', $q$PUESTO #22$q$, 'voluntario', $q$ZONA 5 Arriba. Apoya la zona ubicado arriba para dirigir la acomodación. Anima a los asistentes a prepararse para la salida. Pendiente de la salida de nuevos por rampa Betel.$q$, false, 22) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 57, 23 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 62, 31;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 57, 18;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 5'), '23', $q$PUESTO #23$q$, 'voluntario', $q$ZONA 5 Arriba. Ubicado en la parte final de la zona. Dirige la acomodación silla por silla. En la salida toma el lazo y también apoya la salida de nuevos.$q$, false, 23) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 66, 21 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'desktop', 77, 29;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 5'), 'mobile', 64, 17;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 6'), '24', $q$PUESTO #24$q$, 'voluntario', $q$ZONA 6 Abajo. Responsable de zona. Ubica de abajo hacia arriba. Forros: uno en primera silla/fila y otro a mitad de zona. Capas en cada primera silla de la primera fila. Dirige salida de nuevos (carita feliz). Sostiene cuerda abajo; tras salida de zona 8 coordina con el servidor para salida por escalera interna.$q$, false, 24) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 16, 46 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 32, 70;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 42, 86;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 6'), '25', $q$PUESTO #25$q$, 'voluntario', $q$ZONA 6 Abajo. RADIO. Apoya la logística. En salida se ubica arriba sosteniendo lazo, dirigiendo las últimas 4 filas por la rampa Betel. Apoya salida de nuevos y coloca carita feliz.$q$, false, 25) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 21, 41 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 39, 65;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 45, 73;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 6'), '26', $q$PUESTO #26$q$, 'voluntario', $q$ZONA 6 Arriba. RADIO. Responsable de zona. Ubicado abajo por el tamaño de la zona, dirige asistentes hacia arriba. Forros: primera fila y mitad de zona. En salida se ubica abajo para dirigir flujo. Dirige nuevos hacia rampa Betel con carita feliz.$q$, false, 26) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 30, 27 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 56, 46;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 51, 39;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 6'), '27', $q$PUESTO #27$q$, 'voluntario', $q$ZONA 6 Arriba. Apoya la zona ubicado arriba para dirigir acomodación junto a los demás voluntarios. Anima a los asistentes a prepararse para la salida. Atento a salida de nuevos por rampa Betel.$q$, false, 27) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 37, 20 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 66, 37;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 57, 21;
end
$seed$;

do $seed$
declare v_loc uuid; v_pos uuid;
begin
  select l.id into strict v_loc from public.locations l join public.sites s on s.id = l.site_id where s.slug = 'castellana' and l.name = 'Auditorio principal';
  insert into public.positions (location_id, zone_id, code, name, kind, description, uses_radio, sort)
  values (v_loc, (select z.id from public.zones z where z.location_id = v_loc and z.name = 'Zona 6'), '28', $q$PUESTO #28$q$, 'voluntario', $q$ZONA 6 Arriba. Apoya la zona ubicado arriba. Dirige asistentes por fila de paso para llenar desde el rincón derecho hacia arriba. En salida toma lazo y dirige el flujo. Dirige nuevos hacia rampa Betel.$q$, false, 28) returning id into v_pos;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct)
  select v_pos, m.id, 'desktop', 18, 19 from public.maps m where m.location_id = v_loc and m.zone_id is null;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'desktop', 28, 38;
  insert into public.position_markers (position_id, map_id, variant, top_pct, left_pct) select v_pos, (select m.id from public.maps m join public.zones z on z.id = m.zone_id where m.location_id = v_loc and z.name = 'Zona 6'), 'mobile', 42, 26;
end
$seed$;

-- Correos de arranque
insert into public.invitations (email, is_admin, is_head) values
  ('hhherrerap@gmail.com', true,  false),   -- desarrollador / administrador
  ('mreyes@supresencia.com', false, true);  -- cabeza de ministerio
