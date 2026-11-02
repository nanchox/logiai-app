-- LogiAI · Entradas por ubicación: cada auditorio o lugar tiene entradas (izquierda, derecha…) con un cupo asignado por reunión
-- y una nota de quiénes ingresan. El cupo estándar es por reunión del horario; un servicio lo puede ajustar. Aditiva.

create table public.entrances (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  note        text check (note is null or char_length(note) <= 200),       -- quiénes ingresan (asistentes, papás…)
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (location_id, name)
);
create index entrances_sort_idx on public.entrances (location_id, sort);

-- Cupo estándar de una entrada en una reunión de un horario.
create table public.entrance_quotas (
  entrance_id uuid not null references public.entrances(id) on delete cascade,
  meeting_id  uuid not null references public.slot_meetings(id) on delete cascade,
  quota       int  not null check (quota between 0 and 100000),
  primary key (entrance_id, meeting_id)
);
create index entrance_quotas_meeting_idx on public.entrance_quotas (meeting_id);

-- Ajuste del cupo en un servicio concreto. meeting_id es la reunión estándar (slot_meetings) o la del servicio personalizado (event_meetings).
create table public.event_entrance_quotas (
  event_id    uuid not null references public.service_events(id) on delete cascade,
  entrance_id uuid not null references public.entrances(id) on delete cascade,
  meeting_id  uuid not null,
  quota       int  not null check (quota between 0 and 100000),
  updated_by  uuid references public.profiles(user_id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now(),
  primary key (event_id, entrance_id, meeting_id)
);
create index event_entrance_quotas_entrance_idx   on public.event_entrance_quotas (entrance_id);
create index event_entrance_quotas_updated_by_idx on public.event_entrance_quotas (updated_by);

create function public.entrance_site_id(p_entrance uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public.location_site_id(e.location_id) from public.entrances e where e.id = p_entrance
$$;

-- Máximo 12 entradas por ubicación; el cupo estándar es de una reunión de un horario de la misma sede.
create function public.entrances_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.entrances where location_id = new.location_id) >= 12 then
    raise exception 'Una ubicación puede tener máximo 12 entradas' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger entrances_limit before insert on public.entrances for each row execute function public.entrances_limit();

create function public.entrance_quotas_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.entrance_site_id(new.entrance_id) is distinct from (select public.slot_site_id(m.slot_id) from public.slot_meetings m where m.id = new.meeting_id) then
    raise exception 'La reunión no es de la sede de esta entrada' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger entrance_quotas_guard before insert or update on public.entrance_quotas for each row execute function public.entrance_quotas_guard();

-- ¿Es esta una reunión del servicio? (las estándar de su horario, o las suyas si se personalizó)
create function public.is_event_meeting(p_event uuid, p_meeting uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e
    where e.id = p_event
      and ((not e.meetings_custom and exists (select 1 from public.slot_meetings m where m.id = p_meeting and m.slot_id = e.slot_id))
        or (e.meetings_custom and exists (select 1 from public.event_meetings m where m.id = p_meeting and m.event_id = e.id))))
$$;

-- Ajusta los cupos de un servicio de una sola vez: [{"entrance_id": "…", "meeting_id": "…", "quota": 900}, …]. Un valor nulo vuelve al estándar.
-- Mismas reglas de quién y cuándo que los conteos (can_count_event). Todo o nada.
create function public.save_event_quotas(p_event uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_ent uuid; v_meet uuid; v_q jsonb;
begin
  if not public.can_count_event(p_event) then
    raise exception 'No puedes cambiar los cupos de este servicio: todavía no es el día, ya pasó el plazo de 24 horas (solo el líder puede corregir) o no tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Los cupos no son válidos' using errcode = 'check_violation'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_ent := public.safe_uuid(r ->> 'entrance_id'); v_meet := public.safe_uuid(r ->> 'meeting_id'); v_q := r -> 'quota';
    if v_ent is null or v_meet is null then raise exception 'Los cupos no son válidos' using errcode = 'check_violation'; end if;
    if public.entrance_site_id(v_ent) is distinct from public.event_site_id(p_event) then
      raise exception 'La entrada no es de la sede de este servicio' using errcode = 'check_violation';
    end if;
    if not public.is_event_meeting(p_event, v_meet) then
      raise exception 'La reunión no es de este servicio' using errcode = 'check_violation';
    end if;
    if v_q is null or jsonb_typeof(v_q) = 'null' then
      delete from public.event_entrance_quotas where event_id = p_event and entrance_id = v_ent and meeting_id = v_meet;
    else
      if jsonb_typeof(v_q) <> 'number' or v_q::text !~ '^[0-9]{1,6}$' or (v_q::text)::int > 100000 then
        raise exception 'El cupo debe ser un número entero entre 0 y 100000' using errcode = 'check_violation';
      end if;
      insert into public.event_entrance_quotas (event_id, entrance_id, meeting_id, quota) values (p_event, v_ent, v_meet, (v_q::text)::int)
      on conflict (event_id, entrance_id, meeting_id) do update set quota = excluded.quota, updated_by = auth.uid(), updated_at = now()
        where public.event_entrance_quotas.quota is distinct from excluded.quota;
    end if;
  end loop;
end $$;

-- ───────────── RLS ─────────────
alter table public.entrances             enable row level security;
alter table public.entrance_quotas       enable row level security;
alter table public.event_entrance_quotas enable row level security;
revoke all on public.entrances, public.entrance_quotas, public.event_entrance_quotas from anon, authenticated;
grant select, insert, update, delete on public.entrances, public.entrance_quotas to authenticated;
grant select on public.event_entrance_quotas to authenticated;                 -- se escriben con save_event_quotas()

-- Las ve quien ve la sede; las cambia quien la administra (líder de su sede, cabeza y administrador).
create policy entrances_select on public.entrances for select to authenticated using (public.can_view_site(public.location_site_id(location_id)));
create policy entrances_write  on public.entrances for all to authenticated
  using (public.can_manage_site(public.location_site_id(location_id))) with check (public.can_manage_site(public.location_site_id(location_id)));
create policy entrance_quotas_select on public.entrance_quotas for select to authenticated using (public.can_view_site(public.entrance_site_id(entrance_id)));
create policy entrance_quotas_write  on public.entrance_quotas for all to authenticated
  using (public.can_manage_site(public.entrance_site_id(entrance_id))) with check (public.can_manage_site(public.entrance_site_id(entrance_id)));
create policy event_entrance_quotas_select on public.event_entrance_quotas for select to authenticated using (public.can_view_site(public.event_site_id(event_id)));

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
