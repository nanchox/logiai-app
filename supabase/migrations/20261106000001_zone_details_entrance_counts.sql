-- LogiAI · Detalle por zona y conteo por entrada:
--  · cada zona tiene un cuadro de texto grande con datos de cómo ingresar, cómo evacuar, etc., que el asistente (chat) también consulta;
--  · cada entrada tiene un cuadro de texto con las zonas que atiende y su conteo se puede escribir o corregir a mano (con el cupo como tope). Aditiva.

alter table public.zones add column detail text not null default '' check (char_length(detail) <= 5000);
alter table public.entrances add column zones_text text check (zones_text is null or char_length(zones_text) <= 300);

-- ───────────── El asistente también busca en el detalle de las zonas y en las entradas ─────────────
create or replace function public.search_manual(p_query text, p_limit int default 8)
returns table (kind text, id uuid, site_slug text, location_id uuid, title text, body text, rank real)
language sql stable set search_path = '' as $$
  with q as (select public.chat_tsquery(p_query) as tsq),
  docs as (
    select 'posicion'::text as kind, p.id, s.slug as site_slug, l.id as location_id,
           p.code || ' · ' || p.name || ' (' || l.name || ', ' || s.name || ')' as title,
           concat_ws('. ',
             nullif(p.description, ''),
             case when z.name is not null then 'Zona: ' || z.name end,
             case when p.uses_radio then 'Usa radio' end,
             case when p.kind = 'supervisor' then 'Posición de supervisor' end,
             case when cardinality(p.days) > 0 then 'Aplica los días: ' || array_to_string(p.days, ', ') end,
             case when cardinality(p.shifts) > 0 then 'Franjas: ' || array_to_string(p.shifts, ', ') end) as body
    from public.positions p
    join public.locations l on l.id = p.location_id
    join public.sites s on s.id = l.site_id
    left join public.zones z on z.id = p.zone_id
    where p.is_active
    union all
    select 'flujo', f.id, s.slug, null::uuid,
           f.name || ' (' || s.name || ')',
           concat_ws(E'\n', nullif(f.description, ''),
             (select string_agg(st.step_order || '. ' || st.title || case when st.instructions <> '' then ': ' || st.instructions else '' end, E'\n' order by st.step_order)
                from public.flow_steps st where st.flow_id = f.id))
    from public.flows f join public.sites s on s.id = f.site_id
    union all
    select 'novedad', a.id, null, null::uuid, a.title, a.body
    from public.announcements a
    where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
    union all
    -- Detalle de cada zona: cómo ingresar, cómo evacuar y otros datos específicos de la zona
    select 'zona', z.id, s.slug, l.id,
           z.name || ' (' || l.name || ', ' || s.name || ')',
           z.detail
    from public.zones z
    join public.locations l on l.id = z.location_id
    join public.sites s on s.id = l.site_id
    where btrim(z.detail) <> ''
    union all
    -- Entradas: qué zonas atienden y quiénes ingresan por ellas
    select 'entrada', e.id, s.slug, l.id,
           e.name || ' (' || l.name || ', ' || s.name || ')',
           concat_ws('. ', case when btrim(coalesce(e.zones_text, '')) <> '' then 'Zonas que atiende: ' || e.zones_text end,
                           case when btrim(coalesce(e.note, '')) <> '' then 'Quiénes ingresan: ' || e.note end)
    from public.entrances e
    join public.locations l on l.id = e.location_id
    join public.sites s on s.id = l.site_id
    where btrim(coalesce(e.zones_text, '')) <> '' or btrim(coalesce(e.note, '')) <> ''
  )
  select d.kind, d.id, d.site_slug, d.location_id, d.title, left(d.body, 1500),
         ts_rank_cd(to_tsvector('spanish', d.title || ' ' || d.body), q.tsq)::real as rank
  from docs d, q
  where q.tsq is not null and to_tsvector('spanish', d.title || ' ' || d.body) @@ q.tsq
  order by rank desc, d.title
  limit least(greatest(coalesce(p_limit, 8), 1), 12)
$$;

-- ───────────── El contador muestra también las zonas que atiende la entrada ─────────────
drop function public.entrance_counter_state(uuid, uuid);
create function public.entrance_counter_state(p_event uuid, p_entrance uuid)
returns table (entrance_name text, entrance_note text, location_name text, location_capacity int, meeting_id uuid, meeting_time time, meeting_label text, quota int, count int, location_total int, entrance_zones text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_entrance_counter(p_event, p_entrance) then
    raise exception 'No puedes contar en esta entrada: solo el día del servicio y quien ocupa su posición de conteo o planifica el servicio' using errcode = 'insufficient_privilege';
  end if;
  return query
    with ev as (select e.id, e.slot_id, e.meetings_custom from public.service_events e where e.id = p_event),
    meetings as (
      select m.id as mid, m.start_time as t, m.label as lb from ev join public.event_meetings m on m.event_id = ev.id where ev.meetings_custom
      union all
      select m.id, m.start_time, m.label from ev join public.slot_meetings m on m.slot_id = ev.slot_id where not ev.meetings_custom
      union all
      select '00000000-0000-0000-0000-000000000000'::uuid, null::time, null::text
        where not exists (select 1 from ev join public.event_meetings m on m.event_id = ev.id where ev.meetings_custom)
          and not exists (select 1 from ev join public.slot_meetings m on m.slot_id = ev.slot_id where not ev.meetings_custom)
    )
    select en.name, en.note, l.name, l.capacity, mt.mid, mt.t, mt.lb,
           public.entrance_quota_for(p_event, p_entrance, mt.mid),
           coalesce((select c.count from public.entrance_counters c where c.event_id = p_event and c.entrance_id = p_entrance and c.meeting_id = mt.mid), 0),
           coalesce((select sum(c.count)::int from public.entrance_counters c join public.entrances x on x.id = c.entrance_id
                     where c.event_id = p_event and c.meeting_id = mt.mid and x.location_id = en.location_id), 0),
           en.zones_text
    from public.entrances en join public.locations l on l.id = en.location_id, meetings mt
    where en.id = p_entrance
    order by mt.t nulls first;
end $$;

-- ───────────── Conteo por entrada a mano ─────────────
-- Escribe o corrige el conteo de entradas por reunión: [{"entrance_id": "…", "meeting_id": "…", "count": 120}, …]. Un valor nulo borra el conteo de esa entrada.
-- Mismas reglas de quién y cuándo que los conteos (can_count_event). No pasa del cupo de la entrada (si lo tiene) ni, con las demás entradas del lugar, del aforo.
-- Todo o nada. El total del lugar y la reunión pasa a los totales del servicio, igual que con el contador digital.
create function public.save_entrance_counts(p_event uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  r jsonb; v_ent uuid; v_meet uuid; v_val jsonb; v_loc uuid; v_cap int; v_quota int; v_cur int; v_new int; v_total int; v_name text; v_by uuid;
  v_pairs jsonb := '[]'::jsonb; pair record;
begin
  if not public.can_count_event(p_event) then
    raise exception 'No puedes registrar conteos de este servicio: todavía no es el día, ya pasó el plazo de 24 horas (solo el líder puede corregir) o no tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Los conteos no son válidos' using errcode = 'check_violation'; end if;
  v_by := (select p.user_id from public.profiles p where p.user_id = auth.uid());

  for r in select * from jsonb_array_elements(p_items) loop
    v_ent := public.safe_uuid(r ->> 'entrance_id'); v_meet := public.safe_uuid(r ->> 'meeting_id'); v_val := r -> 'count';
    if v_ent is null or v_meet is null then raise exception 'Los conteos no son válidos' using errcode = 'check_violation'; end if;
    if public.entrance_site_id(v_ent) is distinct from public.event_site_id(p_event) then
      raise exception 'La entrada no es de la sede de este servicio' using errcode = 'check_violation';
    end if;
    if not (public.is_event_meeting(p_event, v_meet)
            or (v_meet = c_zero and not exists (select 1 from public.slot_meetings m join public.service_events e on e.slot_id = m.slot_id where e.id = p_event and not e.meetings_custom)
                                   and not exists (select 1 from public.event_meetings m join public.service_events e on e.id = m.event_id where e.id = p_event and e.meetings_custom))) then
      raise exception 'La reunión no es de este servicio' using errcode = 'check_violation';
    end if;
    select en.location_id, en.name into v_loc, v_name from public.entrances en where en.id = v_ent;
    perform pg_advisory_xact_lock(hashtext(p_event::text || v_meet::text || v_loc::text));
    select c.count into v_cur from public.entrance_counters c where c.event_id = p_event and c.entrance_id = v_ent and c.meeting_id = v_meet;

    if v_val is null or jsonb_typeof(v_val) = 'null' then
      delete from public.entrance_counters where event_id = p_event and entrance_id = v_ent and meeting_id = v_meet;
      v_new := null;
    else
      if jsonb_typeof(v_val) <> 'number' or v_val::text !~ '^[0-9]{1,6}$' or (v_val::text)::int > 100000 then
        raise exception 'El conteo debe ser un número entero entre 0 y 100000' using errcode = 'check_violation';
      end if;
      v_new := (v_val::text)::int;
      v_quota := public.entrance_quota_for(p_event, v_ent, v_meet);
      if v_quota is not null and v_new > v_quota then
        raise exception 'El conteo de «%» (%) no puede superar su cupo (%)', v_name, v_new, v_quota using errcode = 'check_violation';
      end if;
      insert into public.entrance_counters (event_id, entrance_id, meeting_id, count, updated_by) values (p_event, v_ent, v_meet, v_new, v_by)
      on conflict (event_id, entrance_id, meeting_id) do update set count = excluded.count, updated_by = excluded.updated_by, updated_at = now();
    end if;
    if v_new is distinct from v_cur then
      insert into public.entrance_count_ops (op_id, event_id, entrance_id, meeting_id, delta, applied, by_user)
      values (gen_random_uuid(), p_event, v_ent, v_meet, coalesce(v_new, 0) - coalesce(v_cur, 0), coalesce(v_new, 0) - coalesce(v_cur, 0), v_by);
    end if;
    v_pairs := v_pairs || jsonb_build_array(jsonb_build_object('l', v_loc, 'm', v_meet));
  end loop;

  -- Aforo y totales del servicio por cada lugar y reunión tocados
  for pair in select distinct (x ->> 'l')::uuid as location_id, (x ->> 'm')::uuid as meeting_id from jsonb_array_elements(v_pairs) x loop
    select l.capacity into v_cap from public.locations l where l.id = pair.location_id;
    select coalesce(sum(c.count), 0)::int into v_total from public.entrance_counters c join public.entrances x on x.id = c.entrance_id
     where c.event_id = p_event and c.meeting_id = pair.meeting_id and x.location_id = pair.location_id;
    if v_cap is not null and v_total > v_cap then
      raise exception 'Las entradas de «%» suman % y el aforo es %', (select l.name from public.locations l where l.id = pair.location_id), v_total, v_cap using errcode = 'check_violation';
    end if;
    if v_cap is not null then
      if exists (select 1 from public.entrance_counters c join public.entrances x on x.id = c.entrance_id
                 where c.event_id = p_event and c.meeting_id = pair.meeting_id and x.location_id = pair.location_id) then
        insert into public.service_counts (event_id, location_id, meeting_id, total, counted_by)
        values (p_event, pair.location_id, nullif(pair.meeting_id, c_zero), v_total, v_by)
        on conflict (event_id, location_id, meeting_key) do update set total = excluded.total, counted_by = excluded.counted_by;
      else
        delete from public.service_counts where event_id = p_event and location_id = pair.location_id and meeting_key = pair.meeting_id;
      end if;
    end if;
  end loop;
end $$;

-- ───────────── Permisos de las funciones (igual que en las migraciones anteriores) ─────────────
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and pg_get_userbyid(p.proowner) = current_user
      and p.proname <> 'hook_before_user_created'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    if not f.is_trigger then
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;
-- Las funciones del servidor (avisos) siguen sin poder ejecutarlas ninguna persona, ni siquiera con sesión.
revoke execute on function public.support_request_audience(uuid), public.pending_counts_audience(), public.claim_notification(uuid, text, uuid, boolean) from authenticated;
