-- LogiAI · Contador digital de entradas: quien ocupa una posición de conteo (o quien planifica el servicio) cuenta a las personas que
-- entran por una entrada con un botón en el celular. Cada entrada y reunión tiene un solo contador compartido; el cupo es su tope
-- y el aforo de la ubicación nunca se supera. El conteo se refleja solo en los totales del servicio (por reunión). Aditiva.

-- ───────────── Los totales ahora pueden ser por reunión (nulo = todo el servicio, como hasta ahora) ─────────────
alter table public.service_counts add column meeting_id uuid;      -- reunión estándar o del servicio personalizado; nulo = todo el servicio
alter table public.service_counts add column meeting_key uuid generated always as (coalesce(meeting_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
alter table public.service_counts drop constraint service_counts_pkey;
alter table public.service_counts add primary key (event_id, location_id, meeting_key);

-- El registro manual (todo el servicio) solo toca las filas sin reunión.
create or replace function public.save_counts(p_event uuid, p_counts jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_loc uuid; v_total jsonb;
begin
  if not public.can_count_event(p_event) then
    raise exception 'No puedes registrar conteos de este servicio: todavía no es el día, ya pasó el plazo de 24 horas (solo el líder puede corregir) o no tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_counts) is distinct from 'array' then raise exception 'Los conteos no son válidos' using errcode = 'check_violation'; end if;
  for r in select * from jsonb_array_elements(p_counts) loop
    v_loc := public.safe_uuid(r ->> 'location_id');
    v_total := r -> 'total';
    if v_loc is null then raise exception 'Los conteos no son válidos' using errcode = 'check_violation'; end if;
    if v_total is null or jsonb_typeof(v_total) = 'null' then
      if public.location_site_id(v_loc) is distinct from public.event_site_id(p_event) then
        raise exception 'La ubicación no es de la sede de este servicio' using errcode = 'check_violation';
      end if;
      delete from public.service_counts where event_id = p_event and location_id = v_loc and meeting_id is null;
    else
      if jsonb_typeof(v_total) <> 'number' or v_total::text !~ '^[0-9]{1,6}$' then
        raise exception 'El total debe ser un número entero de cero en adelante' using errcode = 'check_violation';
      end if;
      insert into public.service_counts (event_id, location_id, total) values (p_event, v_loc, (v_total::text)::int)
      on conflict (event_id, location_id, meeting_key) do update set total = excluded.total, counted_by = auth.uid()
        where public.service_counts.total is distinct from excluded.total;
    end if;
  end loop;
end $$;

-- ───────────── Contadores ─────────────
create table public.entrance_counters (
  event_id    uuid not null references public.service_events(id) on delete cascade,
  entrance_id uuid not null references public.entrances(id)      on delete cascade,
  meeting_id  uuid not null,                                       -- reunión del servicio; el uuid en ceros si el servicio no tiene reuniones
  count       int  not null default 0 check (count >= 0),
  updated_by  uuid references public.profiles(user_id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (event_id, entrance_id, meeting_id)
);
create index entrance_counters_entrance_idx   on public.entrance_counters (entrance_id);
create index entrance_counters_updated_by_idx on public.entrance_counters (updated_by);

-- Cada toque (o grupo de toques enviado junto) queda registrado; el identificador evita contar dos veces lo que se reenvía al volver la señal.
create table public.entrance_count_ops (
  op_id       uuid primary key,
  event_id    uuid not null references public.service_events(id) on delete cascade,
  entrance_id uuid not null references public.entrances(id)      on delete cascade,
  meeting_id  uuid not null,
  delta       int  not null,                                       -- lo que pidió la persona
  applied     int  not null,                                       -- lo que se aplicó (el cupo y el aforo pueden limitarlo)
  by_user     uuid references public.profiles(user_id) on delete set null,
  at          timestamptz not null default now()
);
create index entrance_count_ops_event_idx   on public.entrance_count_ops (event_id, entrance_id, meeting_id);
create index entrance_count_ops_entrance_idx on public.entrance_count_ops (entrance_id);
create index entrance_count_ops_by_user_idx on public.entrance_count_ops (by_user);

-- ───────────── Reglas ─────────────
-- ¿Puede contar esta entrada en este servicio? Solo el día del servicio, en una entrada de su sede, y solo quien ocupa en la planeación publicada una
-- posición de conteo de esa entrada, o quien planifica el servicio (coordinador, supervisor, líder, cabeza o administrador).
create function public.can_use_entrance_counter(p_event uuid, p_entrance uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e
    where e.id = p_event and e.status = 'programado' and e.group_id is not null and e.service_date = public.today_co()
      and public.entrance_site_id(p_entrance) is not distinct from public.event_site_id(p_event)
      and (public.can_plan_event(p_event)
           or exists (
             select 1 from public.service_assignments a
             join public.positions p on p.id = a.position_id
             join public.service_plans sp on sp.event_id = a.event_id and sp.status = 'publicado'
             where a.event_id = p_event and a.user_id = auth.uid() and p.entrance_id = p_entrance)))
$$;

-- Cupo (el máximo) de una entrada en una reunión de un servicio: el ajuste del servicio; si no, el estándar (o el de la reunión estándar de la que viene).
create function public.entrance_quota_for(p_event uuid, p_entrance uuid, p_meeting uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select q.quota from public.event_entrance_quotas q where q.event_id = p_event and q.entrance_id = p_entrance and q.meeting_id = p_meeting),
    (select q.quota from public.entrance_quotas q where q.entrance_id = p_entrance
       and q.meeting_id = coalesce((select m.base_id from public.event_meetings m where m.id = p_meeting), p_meeting)))
$$;

-- Las entradas que la persona puede contar hoy.
create function public.my_counter_entrances()
returns table (event_id uuid, service_date date, site_name text, group_name text, entrance_id uuid, entrance_name text, entrance_note text, location_name text, assigned boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, e.service_date, si.name, g.name, en.id, en.name, en.note, l.name,
         exists (select 1 from public.service_assignments a join public.positions p on p.id = a.position_id
                 join public.service_plans sp on sp.event_id = a.event_id and sp.status = 'publicado'
                 where a.event_id = e.id and a.user_id = auth.uid() and p.entrance_id = en.id)
  from public.service_events e
  join public.service_slots s on s.id = e.slot_id
  join public.sites si on si.id = s.site_id
  left join public.groups g on g.id = e.group_id
  join public.locations l on l.site_id = s.site_id
  join public.entrances en on en.location_id = l.id
  where public.can_use_entrance_counter(e.id, en.id)
  order by si.sort, l.sort, l.name, en.sort, en.name
$$;

-- Estado del contador de una entrada: una fila por reunión, con su cupo (máximo) y el conteo actual.
create function public.entrance_counter_state(p_event uuid, p_entrance uuid)
returns table (entrance_name text, entrance_note text, location_name text, location_capacity int, meeting_id uuid, meeting_time time, meeting_label text, quota int, count int, location_total int)
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
                     where c.event_id = p_event and c.meeting_id = mt.mid and x.location_id = en.location_id), 0)
    from public.entrances en join public.locations l on l.id = en.location_id, meetings mt
    where en.id = p_entrance
    order by mt.t nulls first;
end $$;

-- Suma (o resta) personas en una entrada y reunión. Idempotente por p_op (se puede reenviar sin contar dos veces). El conteo nunca baja de cero,
-- no pasa del cupo de la entrada ni suma, con las demás entradas del lugar, más que el aforo. Devuelve lo que quedó.
create function public.apply_entrance_delta(p_event uuid, p_entrance uuid, p_meeting uuid, p_delta int, p_op uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_zero constant uuid := '00000000-0000-0000-0000-000000000000';
  v_loc uuid; v_cap int; v_quota int; v_cur int; v_new int; v_other int; v_capped text; v_op public.entrance_count_ops;
begin
  if not public.can_use_entrance_counter(p_event, p_entrance) then
    raise exception 'No puedes contar en esta entrada: solo el día del servicio y quien ocupa su posición de conteo o planifica el servicio' using errcode = 'insufficient_privilege';
  end if;
  if p_op is null then raise exception 'Falta el identificador de la operación' using errcode = 'check_violation'; end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 5000 then raise exception 'La cantidad no es válida' using errcode = 'check_violation'; end if;
  if not (public.is_event_meeting(p_event, p_meeting)
          or (p_meeting = c_zero and not exists (select 1 from public.slot_meetings m join public.service_events e on e.slot_id = m.slot_id where e.id = p_event and not e.meetings_custom)
                                 and not exists (select 1 from public.event_meetings m join public.service_events e on e.id = m.event_id where e.id = p_event and e.meetings_custom))) then
    raise exception 'La reunión no es de este servicio' using errcode = 'check_violation';
  end if;

  v_loc := (select en.location_id from public.entrances en where en.id = p_entrance);
  perform pg_advisory_xact_lock(hashtext(p_event::text || p_meeting::text || v_loc::text));

  select * into v_op from public.entrance_count_ops o where o.op_id = p_op;
  if found then
    if v_op.event_id <> p_event or v_op.entrance_id <> p_entrance or v_op.meeting_id <> p_meeting then
      raise exception 'El identificador de la operación ya se usó' using errcode = 'check_violation';
    end if;
    select c.count into v_cur from public.entrance_counters c where c.event_id = p_event and c.entrance_id = p_entrance and c.meeting_id = p_meeting;
    return jsonb_build_object('count', coalesce(v_cur, 0), 'applied', v_op.applied, 'capped', null, 'duplicate', true);
  end if;

  insert into public.entrance_counters (event_id, entrance_id, meeting_id) values (p_event, p_entrance, p_meeting) on conflict do nothing;
  select c.count into v_cur from public.entrance_counters c where c.event_id = p_event and c.entrance_id = p_entrance and c.meeting_id = p_meeting for update;
  v_quota := public.entrance_quota_for(p_event, p_entrance, p_meeting);
  v_cap := (select l.capacity from public.locations l where l.id = v_loc);
  v_other := coalesce((select sum(c.count) from public.entrance_counters c join public.entrances x on x.id = c.entrance_id
                       where c.event_id = p_event and c.meeting_id = p_meeting and x.location_id = v_loc and c.entrance_id <> p_entrance), 0);

  v_new := v_cur + p_delta;
  if v_new < 0 then v_new := 0; v_capped := 'cero'; end if;
  if v_quota is not null and v_new > v_quota then v_new := greatest(v_cur, v_quota); v_capped := 'cupo'; end if;
  if v_cap is not null and v_new + v_other > v_cap then v_new := greatest(v_cur, v_cap - v_other); v_capped := 'aforo'; end if;

  update public.entrance_counters set count = v_new, updated_by = (select p.user_id from public.profiles p where p.user_id = auth.uid()), updated_at = now()
   where event_id = p_event and entrance_id = p_entrance and meeting_id = p_meeting;
  insert into public.entrance_count_ops (op_id, event_id, entrance_id, meeting_id, delta, applied, by_user)
  values (p_op, p_event, p_entrance, p_meeting, p_delta, v_new - v_cur, (select p.user_id from public.profiles p where p.user_id = auth.uid()));

  -- El total de la ubicación en esa reunión (suma de sus entradas) pasa solo a los totales y reportes del servicio.
  if v_cap is not null then
    insert into public.service_counts (event_id, location_id, meeting_id, total, counted_by)
    values (p_event, v_loc, nullif(p_meeting, c_zero), v_new + v_other, (select p.user_id from public.profiles p where p.user_id = auth.uid()))
    on conflict (event_id, location_id, meeting_key) do update set total = excluded.total, counted_by = excluded.counted_by;
  end if;

  return jsonb_build_object('count', v_new, 'applied', v_new - v_cur, 'capped', v_capped, 'duplicate', false, 'max', v_quota, 'locationTotal', v_new + v_other);
end $$;

-- ───────────── RLS ─────────────
alter table public.entrance_counters  enable row level security;
alter table public.entrance_count_ops enable row level security;
revoke all on public.entrance_counters, public.entrance_count_ops from anon, authenticated;
grant select on public.entrance_counters, public.entrance_count_ops to authenticated;      -- se escriben solo con apply_entrance_delta()

-- Los conteos y el registro los ve quien administra la sede o planifica el servicio; quien cuenta los ve por entrance_counter_state().
create policy entrance_counters_select on public.entrance_counters for select to authenticated using (public.can_plan_event(event_id));
create policy entrance_count_ops_select on public.entrance_count_ops for select to authenticated using (public.can_manage_site(public.event_site_id(event_id)));

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
