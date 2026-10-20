-- LogiAI · Fase 7 · Reemplazos y apoyos: ausencias, apoyos de otros grupos (directos o por solicitud con postulación)
-- Solo para el PRÓXIMO servicio programado de cada grupo. Todo se hace con funciones que validan las reglas; el cliente no escribe en estas tablas.

-- ───────────── Tablas ─────────────
-- Ausencia: la registra quien planifica; se le quitan las posiciones de ese servicio y no se le pueden asignar. Sin motivo (dato innecesario).
create table public.service_absences (
  event_id   uuid not null references public.service_events(id) on delete cascade,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  created_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index service_absences_user_idx    on public.service_absences (user_id);
create index service_absences_creator_idx on public.service_absences (created_by);

create type public.support_request_status as enum ('abierta', 'cancelada');
create type public.support_application_status as enum ('pendiente', 'aprobada', 'rechazada', 'retirada');
create type public.support_source as enum ('directo', 'solicitud');

create table public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.service_events(id) on delete cascade,
  needed     int  not null check (needed between 1 and 50),
  note       text check (char_length(note) <= 300),
  status     public.support_request_status not null default 'abierta',
  created_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index support_requests_one_open_idx on public.support_requests (event_id) where status = 'abierta';
create index support_requests_creator_idx on public.support_requests (created_by);

create table public.support_request_positions (
  request_id  uuid not null references public.support_requests(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  primary key (request_id, position_id)
);
create index support_request_positions_position_idx on public.support_request_positions (position_id);

create table public.support_applications (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  status     public.support_application_status not null default 'pendiente',
  decided_by uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (request_id, user_id)
);
create index support_applications_user_idx    on public.support_applications (user_id);
create index support_applications_decider_idx on public.support_applications (decided_by);

-- Apoyos aprobados: personas de otros grupos que sirven ese día con el grupo del servicio.
create table public.service_supporters (
  event_id   uuid not null references public.service_events(id) on delete cascade,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  source     public.support_source not null,
  request_id uuid references public.support_requests(id) on delete set null,
  added_by   uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index service_supporters_user_idx    on public.service_supporters (user_id);
create index service_supporters_request_idx on public.service_supporters (request_id);
create index service_supporters_adder_idx   on public.service_supporters (added_by);

-- ───────────── Reglas ─────────────
-- El próximo servicio del grupo: programado, de hoy en adelante, y sin otro programado antes para el mismo grupo.
create function public.event_is_next(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e
    where e.id = p_event and e.status = 'programado' and e.group_id is not null and e.service_date >= public.today_co()
      and not exists (
        select 1 from public.service_events e2
        where e2.group_id = e.group_id and e2.status = 'programado'
          and e2.service_date >= public.today_co() and e2.service_date < e.service_date))
$$;

-- ¿Se cruzan dos horarios? Si a alguno le faltan las horas, se asume que sí (más seguro).
create function public.slots_overlap(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_a = p_b then true
    when a.end_time is null or b.end_time is null or coalesce(a.arrival_time, a.start_time) is null or coalesce(b.arrival_time, b.start_time) is null then true
    else coalesce(a.arrival_time, a.start_time) < b.end_time and coalesce(b.arrival_time, b.start_time) < a.end_time
  end
  from public.service_slots a, public.service_slots b where a.id = p_a and b.id = p_b
$$;

-- ¿Tiene la persona algo que sirve ese día en un horario que se cruza? Su propio grupo (si no está ausente) o un apoyo en otro servicio.
create function public.user_busy_on(p_user uuid, p_date date, p_slot uuid, p_except_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e
    join public.memberships m on m.group_id = e.group_id and m.user_id = p_user
    where e.service_date = p_date and e.status = 'programado' and e.id is distinct from p_except_event
      and not exists (select 1 from public.service_absences a where a.event_id = e.id and a.user_id = p_user)
      and public.slots_overlap(e.slot_id, p_slot)
  ) or exists (
    select 1 from public.service_supporters s join public.service_events e on e.id = s.event_id
    where s.user_id = p_user and e.service_date = p_date and e.status = 'programado' and e.id is distinct from p_except_event
      and public.slots_overlap(e.slot_id, p_slot)
  )
$$;

-- Puede apoyar un servicio: voluntario o supervisor de OTRO grupo de la MISMA sede, sin choque de horario ni apoyo ya registrado.
create function public.can_support_event(p_user uuid, p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.service_events ev
    join public.service_slots sl on sl.id = ev.slot_id
    join public.memberships m on m.user_id = p_user
    join public.groups g on g.id = m.group_id
    join public.service_slots gs on gs.id = g.service_slot_id
    where ev.id = p_event and ev.group_id is not null and m.group_id <> ev.group_id
      and gs.site_id = sl.site_id and m.role in ('voluntario', 'supervisor')
      and not exists (select 1 from public.service_supporters s where s.event_id = ev.id and s.user_id = p_user)
      and not public.user_busy_on(p_user, ev.service_date, ev.slot_id, ev.id))
$$;

create function public.support_filled(p_request uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.service_supporters s where s.request_id = p_request
$$;

-- Una solicitud está abierta mientras no se cancele, el servicio siga siendo el próximo y falten personas.
create function public.request_is_open(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.support_requests r
    where r.id = p_request and r.status = 'abierta' and public.event_is_next(r.event_id) and public.support_filled(r.id) < r.needed)
$$;

-- Quien está en el servicio (integrante del grupo o apoyo aprobado): ve su planeación publicada y sus archivos.
create or replace function public.is_event_member(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e join public.memberships m on m.group_id = e.group_id
    where e.id = p_event and m.user_id = auth.uid())
  or exists (select 1 from public.service_supporters s where s.event_id = p_event and s.user_id = auth.uid())
$$;

-- Una asignación vale si la persona es del grupo que sirve o es un apoyo aprobado, no está ausente, la posición es de la sede y aplica
-- a ese día y franja, y las posiciones de supervisor solo van a supervisores. Los coordinadores no ocupan posiciones.
create or replace function public.service_assignments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev record; pos record; v_role public.group_role; v_in_group boolean;
begin
  select e.group_id, s.site_id, s.day, s.shift into ev
    from public.service_events e join public.service_slots s on s.id = e.slot_id where e.id = new.event_id;
  if ev.group_id is null then
    raise exception 'Este servicio todavía no tiene un grupo asignado' using errcode = 'check_violation';
  end if;
  select m.role, (m.group_id = ev.group_id) into v_role, v_in_group from public.memberships m where m.user_id = new.user_id;
  if v_role is null or not (v_in_group or exists (select 1 from public.service_supporters s where s.event_id = new.event_id and s.user_id = new.user_id)) then
    raise exception 'La persona no pertenece al grupo que sirve ese día' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.service_absences a where a.event_id = new.event_id and a.user_id = new.user_id) then
    raise exception 'La persona está marcada como ausente en este servicio' using errcode = 'check_violation';
  end if;
  select p.kind, p.is_active, p.days, p.shifts, l.site_id into pos
    from public.positions p join public.locations l on l.id = p.location_id where p.id = new.position_id;
  if pos.site_id is distinct from ev.site_id then
    raise exception 'La posición no es de la sede de este servicio' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and not pos.is_active then
    raise exception 'La posición está oculta' using errcode = 'check_violation';
  end if;
  if cardinality(pos.days) > 0 and not ev.day = any (pos.days) then
    raise exception 'La posición no aplica a ese día' using errcode = 'check_violation';
  end if;
  if cardinality(pos.shifts) > 0 and not ev.shift = any (pos.shifts) then
    raise exception 'La posición no aplica a esa franja' using errcode = 'check_violation';
  end if;
  if v_role = 'coordinador' then
    raise exception 'Los coordinadores no ocupan posiciones: coordinan el grupo' using errcode = 'check_violation';
  end if;
  if pos.kind = 'supervisor' and v_role = 'voluntario' then
    raise exception 'Las posiciones de supervisor solo se asignan a supervisores' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Al marcar una ausencia se le quitan sus posiciones de ese servicio.
create function public.service_absences_clean() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.service_assignments a where a.event_id = new.event_id and a.user_id = new.user_id;
  return null;
end $$;
create trigger service_absences_clean after insert on public.service_absences for each row execute function public.service_absences_clean();

-- Si un apoyo se retira o lo quitan, pierde sus posiciones de ese servicio y su postulación queda como retirada (la vacante se reabre).
create function public.service_supporters_clean() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.service_assignments a where a.event_id = old.event_id and a.user_id = old.user_id;
  update public.support_applications set status = 'retirada'
   where user_id = old.user_id and request_id = old.request_id and status = 'aprobada';
  return null;
end $$;
create trigger service_supporters_clean after delete on public.service_supporters for each row execute function public.service_supporters_clean();

-- Quien cambia de grupo, deja el servicio como coordinador o sale: pierde sus apoyos futuros y postulaciones pendientes.
create function public.memberships_clean_support() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.group_id is distinct from old.group_id or (new.role = 'coordinador' and old.role <> 'coordinador') then
    delete from public.service_supporters s using public.service_events e
     where s.event_id = e.id and s.user_id = old.user_id and e.service_date >= public.today_co();
    update public.support_applications set status = 'retirada' where user_id = old.user_id and status = 'pendiente';
  end if;
  return null;
end $$;
create trigger memberships_clean_support after update or delete on public.memberships for each row execute function public.memberships_clean_support();

-- ───────────── Funciones que usa la aplicación ─────────────
create function public.mark_absent(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_plan_event(p_event) then raise exception 'No tienes permiso para registrar ausencias en este servicio' using errcode = 'insufficient_privilege'; end if;
  if not public.event_is_next(p_event) then raise exception 'Solo se registran ausencias del próximo servicio del grupo' using errcode = 'check_violation'; end if;
  if not (exists (select 1 from public.service_events e join public.memberships m on m.group_id = e.group_id where e.id = p_event and m.user_id = p_user)
          or exists (select 1 from public.service_supporters s where s.event_id = p_event and s.user_id = p_user)) then
    raise exception 'La persona no está en este servicio' using errcode = 'check_violation';
  end if;
  insert into public.service_absences (event_id, user_id) values (p_event, p_user) on conflict do nothing;
end $$;

create function public.unmark_absent(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_plan_event(p_event) then raise exception 'No tienes permiso para cambiar este servicio' using errcode = 'insufficient_privilege'; end if;
  delete from public.service_absences where event_id = p_event and user_id = p_user;
end $$;

-- Personas de la sede que pueden apoyar, para buscarlas por nombre. Solo nombre, grupo y rol: nunca el correo.
create function public.support_candidates(p_event uuid, p_query text default '')
returns table (user_id uuid, full_name text, group_name text, role public.group_role)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_plan_event(p_event) then raise exception 'No tienes permiso para buscar apoyos en este servicio' using errcode = 'insufficient_privilege'; end if;
  if not public.event_is_next(p_event) then return; end if;
  return query
    select p.user_id, coalesce(p.full_name, 'Integrante'), g.name, m.role
    from public.memberships m
    join public.profiles p on p.user_id = m.user_id
    join public.groups g on g.id = m.group_id
    where public.can_support_event(m.user_id, p_event)
      and (btrim(coalesce(p_query, '')) = '' or p.full_name ilike '%' || btrim(p_query) || '%')
    order by p.full_name
    limit 20;
end $$;

create function public.add_supporter(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_plan_event(p_event) then raise exception 'No tienes permiso para agregar apoyos en este servicio' using errcode = 'insufficient_privilege'; end if;
  if not public.event_is_next(p_event) then raise exception 'Solo se agregan apoyos al próximo servicio del grupo' using errcode = 'check_violation'; end if;
  if not public.can_support_event(p_user, p_event) then
    raise exception 'Esa persona no puede apoyar este servicio (otra sede, mismo grupo, rol, o tiene otro servicio a esa hora)' using errcode = 'check_violation';
  end if;
  insert into public.service_supporters (event_id, user_id, source) values (p_event, p_user, 'directo');
end $$;

-- Quita un apoyo: quien planifica, o el propio apoyo hasta el día anterior al servicio.
create function public.remove_supporter(p_event uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_date date;
begin
  select e.service_date into v_date from public.service_events e where e.id = p_event;
  if p_user = auth.uid() and not public.can_plan_event(p_event) then
    if v_date is null or public.today_co() >= v_date then
      raise exception 'Ya no puedes retirarte desde la aplicación: avisa a tu coordinador' using errcode = 'check_violation';
    end if;
  elsif not public.can_plan_event(p_event) then
    raise exception 'No tienes permiso para cambiar este servicio' using errcode = 'insufficient_privilege';
  end if;
  delete from public.service_supporters where event_id = p_event and user_id = p_user;
end $$;

create function public.create_support_request(p_event uuid, p_needed int, p_note text default null, p_positions uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_pos uuid;
begin
  if not public.can_plan_event(p_event) then raise exception 'No tienes permiso para pedir apoyo en este servicio' using errcode = 'insufficient_privilege'; end if;
  if not public.event_is_next(p_event) then raise exception 'Solo se pide apoyo para el próximo servicio del grupo' using errcode = 'check_violation'; end if;
  if exists (select 1 from public.support_requests r where r.event_id = p_event and r.status = 'abierta') then
    raise exception 'Este servicio ya tiene una solicitud de apoyo abierta' using errcode = 'check_violation';
  end if;
  insert into public.support_requests (event_id, needed, note) values (p_event, p_needed, nullif(btrim(p_note), '')) returning id into v_id;
  foreach v_pos in array coalesce(p_positions, '{}') loop
    if public.position_site_id(v_pos) is distinct from public.event_site_id(p_event) then
      raise exception 'Una de las posiciones no es de la sede de este servicio' using errcode = 'check_violation';
    end if;
    insert into public.support_request_positions (request_id, position_id) values (v_id, v_pos) on conflict do nothing;
  end loop;
  return v_id;
end $$;

create function public.cancel_support_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  select r.event_id into v_event from public.support_requests r where r.id = p_request;
  if v_event is null then raise exception 'La solicitud no existe' using errcode = 'no_data_found'; end if;
  if not public.can_plan_event(v_event) then raise exception 'No tienes permiso para cambiar esta solicitud' using errcode = 'insufficient_privilege'; end if;
  update public.support_requests set status = 'cancelada' where id = p_request;
  update public.support_applications set status = 'rechazada', decided_by = auth.uid(), decided_at = now() where request_id = p_request and status = 'pendiente';
end $$;

create function public.apply_to_request(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para continuar' using errcode = 'insufficient_privilege'; end if;
  select r.event_id into v_event from public.support_requests r where r.id = p_request;
  if v_event is null or not public.request_is_open(p_request) then raise exception 'Esta solicitud ya no está abierta' using errcode = 'check_violation'; end if;
  if not public.can_support_event(auth.uid(), v_event) then
    raise exception 'No puedes apoyar este servicio (es de otra sede, o tienes otro servicio a esa hora)' using errcode = 'check_violation';
  end if;
  insert into public.support_applications (request_id, user_id) values (p_request, auth.uid())
  on conflict (request_id, user_id) do update set status = 'pendiente', decided_by = null, decided_at = null
    where public.support_applications.status = 'retirada';
  if not found then raise exception 'Ya te postulaste a esta solicitud' using errcode = 'check_violation'; end if;
end $$;

create function public.withdraw_application(p_application uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.support_applications set status = 'retirada' where id = p_application and user_id = auth.uid() and status = 'pendiente';
  if not found then raise exception 'No hay una postulación pendiente tuya para retirar' using errcode = 'check_violation'; end if;
end $$;

create function public.decide_application(p_application uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.support_applications; r public.support_requests;
begin
  select * into a from public.support_applications where id = p_application;
  if not found then raise exception 'La postulación no existe' using errcode = 'no_data_found'; end if;
  select * into r from public.support_requests where id = a.request_id;
  if not public.can_plan_event(r.event_id) then raise exception 'No tienes permiso para decidir esta postulación' using errcode = 'insufficient_privilege'; end if;
  if a.status <> 'pendiente' then raise exception 'Esta postulación ya fue atendida' using errcode = 'check_violation'; end if;
  if p_approve then
    if not public.request_is_open(r.id) then raise exception 'La solicitud ya no está abierta (se llenó, se canceló o el servicio ya no es el próximo)' using errcode = 'check_violation'; end if;
    if not public.can_support_event(a.user_id, r.event_id) then raise exception 'Esa persona ya no puede apoyar este servicio (tiene otro servicio a esa hora)' using errcode = 'check_violation'; end if;
    insert into public.service_supporters (event_id, user_id, source, request_id) values (r.event_id, a.user_id, 'solicitud', r.id);
    update public.support_applications set status = 'aprobada', decided_by = auth.uid(), decided_at = now() where id = a.id;
  else
    update public.support_applications set status = 'rechazada', decided_by = auth.uid(), decided_at = now() where id = a.id;
  end if;
end $$;

-- Solicitudes abiertas que la persona puede atender (y aquellas a las que ya se postuló), sin exponer nada más del servicio.
create function public.open_support_requests()
returns table (request_id uuid, service_date date, site_name text, day public.service_day, shift public.service_shift, start_time time, group_name text,
               needed int, filled int, note text, position_names text[], my_status public.support_application_status, application_id uuid)
language sql stable security definer set search_path = '' as $$
  select r.id, e.service_date, si.name, sl.day, sl.shift, sl.start_time, g.name, r.needed, public.support_filled(r.id), r.note,
         coalesce((select array_agg(p.code || ' · ' || p.name order by p.sort, p.code) from public.support_request_positions rp join public.positions p on p.id = rp.position_id where rp.request_id = r.id), '{}'),
         ap.status, ap.id
  from public.support_requests r
  join public.service_events e on e.id = r.event_id
  join public.service_slots sl on sl.id = e.slot_id
  join public.sites si on si.id = sl.site_id
  join public.groups g on g.id = e.group_id
  left join public.support_applications ap on ap.request_id = r.id and ap.user_id = auth.uid()
  where auth.uid() is not null
    and ((public.request_is_open(r.id) and public.can_support_event(auth.uid(), r.event_id))
         or (ap.status in ('pendiente', 'aprobada') and e.service_date >= public.today_co()))
  order by e.service_date, g.name
$$;

-- Postulaciones de una solicitud, para quien planifica ese servicio.
create function public.request_applications(p_request uuid)
returns table (id uuid, user_id uuid, full_name text, group_name text, role public.group_role, status public.support_application_status, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_event uuid;
begin
  select r.event_id into v_event from public.support_requests r where r.id = p_request;
  if v_event is null or not public.can_plan_event(v_event) then raise exception 'No tienes permiso para ver estas postulaciones' using errcode = 'insufficient_privilege'; end if;
  return query
    select a.id, a.user_id, coalesce(p.full_name, 'Integrante'), g.name, m.role, a.status, a.created_at
    from public.support_applications a
    join public.profiles p on p.user_id = a.user_id
    left join public.memberships m on m.user_id = a.user_id
    left join public.groups g on g.id = m.group_id
    where a.request_id = p_request
    order by a.created_at;
end $$;

-- Quiénes están en el servicio: integrantes del grupo y apoyos (con su grupo de origen), y si están ausentes.
create function public.event_people(p_event uuid)
returns table (user_id uuid, full_name text, role public.group_role, origin text, group_name text, absent boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_plan_event(p_event) or public.is_event_member(p_event)) then
    raise exception 'No tienes permiso para ver este servicio' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.user_id, coalesce(p.full_name, 'Integrante'), m.role, 'miembro'::text, g.name,
           exists (select 1 from public.service_absences a where a.event_id = p_event and a.user_id = m.user_id)
    from public.service_events e
    join public.memberships m on m.group_id = e.group_id
    join public.profiles p on p.user_id = m.user_id
    join public.groups g on g.id = m.group_id
    where e.id = p_event
    union all
    select s.user_id, coalesce(p.full_name, 'Integrante'), coalesce(m.role, 'voluntario'::public.group_role), 'apoyo'::text, coalesce(g.name, ''),
           exists (select 1 from public.service_absences a where a.event_id = p_event and a.user_id = s.user_id)
    from public.service_supporters s
    join public.profiles p on p.user_id = s.user_id
    left join public.memberships m on m.user_id = s.user_id
    left join public.groups g on g.id = m.group_id
    where s.event_id = p_event
    order by 4, 3, 2;
end $$;

-- Nombre del grupo que sirve (un apoyo no ve los grupos ajenos con sus permisos normales).
create function public.event_group_name(p_event uuid) returns text
language sql stable security definer set search_path = '' as $$
  select g.name from public.service_events e join public.groups g on g.id = e.group_id
  where e.id = p_event and (public.can_plan_event(p_event) or public.is_event_member(p_event))
$$;

-- Servicios en los que la persona apoya.
create function public.my_support_events()
returns table (event_id uuid, service_date date, site_name text, day public.service_day, shift public.service_shift, group_name text, source public.support_source, status public.service_event_status)
language sql stable security definer set search_path = '' as $$
  select e.id, e.service_date, si.name, sl.day, sl.shift, g.name, s.source, e.status
  from public.service_supporters s
  join public.service_events e on e.id = s.event_id
  join public.service_slots sl on sl.id = e.slot_id
  join public.sites si on si.id = sl.site_id
  left join public.groups g on g.id = e.group_id
  where s.user_id = auth.uid()
  order by e.service_date desc
$$;

-- Apoyos de personas de un grupo a otros grupos (lo ve su coordinador, el líder de la sede, la cabeza y el administrador).
create function public.outgoing_supports(p_group uuid)
returns table (full_name text, service_date date, site_name text, to_group_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_admin_or_head() or public.is_site_leader(public.group_site_id(p_group))
          or exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.group_id = p_group and m.role = 'coordinador')) then
    raise exception 'No tienes permiso para ver estos apoyos' using errcode = 'insufficient_privilege';
  end if;
  return query
    select coalesce(p.full_name, 'Integrante'), e.service_date, si.name, g.name
    from public.service_supporters s
    join public.memberships m on m.user_id = s.user_id and m.group_id = p_group
    join public.profiles p on p.user_id = s.user_id
    join public.service_events e on e.id = s.event_id
    join public.service_slots sl on sl.id = e.slot_id
    join public.sites si on si.id = sl.site_id
    left join public.groups g on g.id = e.group_id
    where e.service_date >= public.today_co()
    order by e.service_date, 1;
end $$;

-- ───────────── RLS (lectura; todo se escribe con las funciones de arriba) ─────────────
alter table public.service_absences          enable row level security;
alter table public.support_requests          enable row level security;
alter table public.support_request_positions enable row level security;
alter table public.support_applications      enable row level security;
alter table public.service_supporters        enable row level security;
revoke all on public.service_absences, public.support_requests, public.support_request_positions, public.support_applications, public.service_supporters from anon, authenticated;
grant select on public.service_absences, public.support_requests, public.support_request_positions, public.support_applications, public.service_supporters to authenticated;

create policy absences_select on public.service_absences for select to authenticated using (user_id = auth.uid() or public.can_plan_event(event_id));
create policy supporters_select on public.service_supporters for select to authenticated using (user_id = auth.uid() or public.can_plan_event(event_id) or public.is_event_member(event_id));
create policy requests_select on public.support_requests for select to authenticated using (public.can_plan_event(event_id));
create policy request_positions_select on public.support_request_positions for select to authenticated
  using (exists (select 1 from public.support_requests r where r.id = request_id and public.can_plan_event(r.event_id)));
create policy applications_select on public.support_applications for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.support_requests r where r.id = request_id and public.can_plan_event(r.event_id)));

-- Quien apoya un servicio puede abrirlo (para ver su planeación publicada).
drop policy service_events_select on public.service_events;
create policy service_events_select on public.service_events for select to authenticated
  using (
    (group_id is not null and public.can_view_group(group_id))
    or public.can_manage_site(public.slot_site_id(slot_id))
    or exists (select 1 from public.service_assignments a where a.event_id = service_events.id and a.user_id = auth.uid() and public.plan_is_published(a.event_id))
    or exists (select 1 from public.service_supporters s where s.event_id = service_events.id and s.user_id = auth.uid())
  );

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
