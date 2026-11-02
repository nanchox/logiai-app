-- LogiAI · Reuniones por horario: un horario (por ejemplo el sábado de una sede) tiene reuniones con hora (1, 3, 5 y 7 pm).
-- La lista estándar la define quien administra la sede; un servicio concreto la puede personalizar (por ejemplo, el horario de fin de año).
-- El mismo grupo sirve todas las reuniones del día: la rotación y la planeación no cambian. Aditiva.

create table public.slot_meetings (
  id         uuid primary key default gen_random_uuid(),
  slot_id    uuid not null references public.service_slots(id) on delete cascade,
  start_time time not null,
  label      text check (label is null or char_length(btrim(label)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (slot_id, start_time)
);

alter table public.service_events add column meetings_custom boolean not null default false;

-- Reuniones de un servicio personalizado (copia de las estándar que luego se edita solo para ese servicio).
create table public.event_meetings (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.service_events(id) on delete cascade,
  base_id    uuid references public.slot_meetings(id) on delete set null,     -- la reunión estándar de la que viene (para heredar cupos y reservas)
  start_time time not null,
  label      text check (label is null or char_length(btrim(label)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (event_id, start_time)
);
create index event_meetings_base_idx on public.event_meetings (base_id);

-- Máximo 8 reuniones por horario o por servicio.
create function public.meetings_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'slot_meetings' then
    if (select count(*) from public.slot_meetings where slot_id = new.slot_id) >= 8 then
      raise exception 'Un horario puede tener máximo 8 reuniones' using errcode = 'check_violation';
    end if;
  else
    if not exists (select 1 from public.service_events e where e.id = new.event_id and e.meetings_custom) then
      raise exception 'Primero personaliza las reuniones de este servicio' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.event_meetings where event_id = new.event_id) >= 8 then
      raise exception 'Un servicio puede tener máximo 8 reuniones' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger slot_meetings_limit  before insert on public.slot_meetings  for each row execute function public.meetings_limit();
create trigger event_meetings_limit before insert on public.event_meetings for each row execute function public.meetings_limit();

-- Personaliza las reuniones de un servicio: copia las estándar para editarlas solo en ese servicio.
create function public.customize_event_meetings(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_slot uuid;
begin
  if not public.can_manage_site(public.event_site_id(p_event)) then
    raise exception 'No tienes permiso para cambiar las reuniones de este servicio' using errcode = 'insufficient_privilege';
  end if;
  if (select e.meetings_custom from public.service_events e where e.id = p_event) then return; end if;
  select e.slot_id into v_slot from public.service_events e where e.id = p_event;
  update public.service_events set meetings_custom = true where id = p_event;
  insert into public.event_meetings (event_id, base_id, start_time, label)
  select p_event, m.id, m.start_time, m.label from public.slot_meetings m where m.slot_id = v_slot;
end $$;

-- Vuelve a las reuniones estándar del horario.
create function public.reset_event_meetings(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_site(public.event_site_id(p_event)) then
    raise exception 'No tienes permiso para cambiar las reuniones de este servicio' using errcode = 'insufficient_privilege';
  end if;
  delete from public.event_meetings where event_id = p_event;
  update public.service_events set meetings_custom = false where id = p_event;
end $$;

-- ───────────── RLS ─────────────
alter table public.slot_meetings  enable row level security;
alter table public.event_meetings enable row level security;
revoke all on public.slot_meetings, public.event_meetings from anon, authenticated;
grant select, insert, update, delete on public.slot_meetings, public.event_meetings to authenticated;

-- Las ve quien ve la sede; las cambia quien la administra (líder de su sede, cabeza y administrador).
create policy slot_meetings_select on public.slot_meetings for select to authenticated using (public.can_view_site(public.slot_site_id(slot_id)));
create policy slot_meetings_write  on public.slot_meetings for all to authenticated
  using (public.can_manage_site(public.slot_site_id(slot_id))) with check (public.can_manage_site(public.slot_site_id(slot_id)));
create policy event_meetings_select on public.event_meetings for select to authenticated using (public.can_view_site(public.event_site_id(event_id)));
create policy event_meetings_write  on public.event_meetings for all to authenticated
  using (public.can_manage_site(public.event_site_id(event_id))) with check (public.can_manage_site(public.event_site_id(event_id)));

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
