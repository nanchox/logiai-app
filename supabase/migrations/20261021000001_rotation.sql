-- LogiAI · Fase 5 · Rotación y calendario de servicios, planeación de posiciones y archivos de programación

-- ───────────── Utilidades ─────────────
create function public.today_co() returns date
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Bogota')::date $$;

create function public.safe_uuid(p text) returns uuid
language sql immutable set search_path = '' as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end
$$;

-- ───────────── Orden de rotación de los grupos de un horario ─────────────
alter table public.groups add column rotation_order int not null default 0;
update public.groups g set rotation_order = r.n
from (select id, row_number() over (partition by service_slot_id order by created_at, name) as n from public.groups) r
where r.id = g.id;

-- Un grupo nuevo entra al final de la rotación de su horario.
create function public.groups_set_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.rotation_order = 0 then
    new.rotation_order := coalesce((select max(g.rotation_order) from public.groups g where g.service_slot_id = new.service_slot_id), 0) + 1;
  end if;
  return new;
end $$;
create trigger groups_set_order before insert on public.groups for each row execute function public.groups_set_order();

-- ───────────── Servicios (una fila por horario y fecha) ─────────────
create type public.service_event_status as enum ('programado', 'cancelado');
create type public.service_event_kind   as enum ('rotacion', 'especial');

create table public.service_events (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references public.service_slots(id) on delete cascade,
  service_date  date not null,
  group_id      uuid references public.groups(id) on delete set null,   -- quién sirve (puede ajustarse a mano)
  kind          public.service_event_kind   not null default 'rotacion',
  turn          int check (turn >= 0),                                   -- puesto del turno en el orden de rotación (para continuar la secuencia)
  manual        boolean not null default false,                         -- ajustado a mano: la rotación no lo toca
  status        public.service_event_status not null default 'programado',
  cancel_reason text,
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (slot_id, service_date),
  check (kind = 'especial' or turn is not null),
  check (kind <> 'especial' or manual)
);
create index service_events_group_idx on public.service_events (group_id, service_date);

-- ───────────── Cancelaciones ─────────────
-- Sin sede = todas las sedes (festivos); con sede y sin horario = todos los horarios de la sede; con horario = solo ese.
-- Una fecha cancelada sigue consumiendo su turno: el grupo al que le tocaba lo pierde y la rotación continúa por calendario.
create table public.service_cancellations (
  id           uuid primary key default gen_random_uuid(),
  service_date date not null,
  site_id      uuid references public.sites(id) on delete cascade,
  slot_id      uuid references public.service_slots(id) on delete cascade,
  reason       text check (char_length(reason) <= 300),
  created_by   uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  check (slot_id is null or site_id is not null),
  unique nulls not distinct (service_date, site_id, slot_id)
);
create index service_cancellations_site_idx    on public.service_cancellations (site_id);
create index service_cancellations_slot_idx    on public.service_cancellations (slot_id);
create index service_cancellations_creator_idx on public.service_cancellations (created_by);

-- ───────────── Planeación de posiciones ─────────────
create type public.plan_status as enum ('borrador', 'publicado');

create table public.service_plans (
  event_id     uuid primary key references public.service_events(id) on delete cascade,
  status       public.plan_status not null default 'borrador',
  published_at timestamptz,
  published_by uuid references public.profiles(user_id) on delete set null,
  updated_at   timestamptz not null default now()
);
create index service_plans_publisher_idx on public.service_plans (published_by);

-- Varias personas por posición y varias posiciones por persona.
create table public.service_assignments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.service_events(id) on delete cascade,
  position_id uuid not null references public.positions(id)      on delete cascade,
  user_id     uuid not null references public.profiles(user_id)  on delete cascade,
  created_at  timestamptz not null default now(),
  unique (event_id, position_id, user_id)
);
create index service_assignments_position_idx on public.service_assignments (position_id);
create index service_assignments_user_idx     on public.service_assignments (user_id);

create table public.service_position_notes (
  event_id    uuid not null references public.service_events(id) on delete cascade,
  position_id uuid not null references public.positions(id)      on delete cascade,
  note        text not null check (char_length(btrim(note)) between 1 and 1000),
  primary key (event_id, position_id)
);
create index service_position_notes_position_idx on public.service_position_notes (position_id);

-- ───────────── Archivos de programación (PDF, Excel o imagen) ─────────────
create table public.schedule_files (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.service_events(id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) between 1 and 200),
  mime_type    text,
  size_bytes   bigint check (size_bytes between 1 and 10485760),
  uploaded_by  uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index schedule_files_event_idx    on public.schedule_files (event_id);
create index schedule_files_uploader_idx on public.schedule_files (uploaded_by);

create function public.schedule_files_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.schedule_files f where f.event_id = new.event_id) >= 5 then
    raise exception 'Máximo 5 archivos por servicio: quita alguno antes de subir otro' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger schedule_files_limit before insert on public.schedule_files for each row execute function public.schedule_files_limit();

-- ───────────── Permisos auxiliares ─────────────
create function public.event_slot_id(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select e.slot_id from public.service_events e where e.id = p_event $$;

create function public.event_site_id(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.site_id from public.service_events e join public.service_slots s on s.id = e.slot_id where e.id = p_event
$$;

create function public.event_group_id(p_event uuid) returns uuid
language sql stable security definer set search_path = '' as $$ select e.group_id from public.service_events e where e.id = p_event $$;

-- Integrante del grupo que sirve en ese servicio.
create function public.is_event_member(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e join public.memberships m on m.group_id = e.group_id
    where e.id = p_event and m.user_id = auth.uid())
$$;

-- Planifica un servicio: cabeza/admin, líder de la sede, y coordinadores y supervisores del grupo que sirve.
create function public.can_plan_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin_or_head()
    or public.is_site_leader(public.event_site_id(p_event))
    or exists (
      select 1 from public.service_events e join public.memberships m on m.group_id = e.group_id
      where e.id = p_event and m.user_id = auth.uid() and m.role in ('coordinador', 'supervisor'))
$$;

create function public.plan_is_published(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.service_plans p where p.event_id = p_event and p.status = 'publicado')
$$;

-- ───────────── Cancelaciones: estado de los servicios ─────────────
create function public.cancellation_reason_for(p_slot uuid, p_date date) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(c.reason, '')
  from public.service_cancellations c join public.service_slots s on s.id = p_slot
  where c.service_date = p_date and (c.site_id is null or c.site_id = s.site_id) and (c.slot_id is null or c.slot_id = p_slot)
  order by (c.slot_id is not null) desc, (c.site_id is not null) desc
  limit 1
$$;

create function public.service_events_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.cancellation_reason_for(new.slot_id, new.service_date);
  new.status := case when v_reason is null then 'programado' else 'cancelado' end;
  new.cancel_reason := nullif(v_reason, '');
  new.updated_at := now();
  return new;
end $$;
create trigger service_events_status before insert on public.service_events for each row execute function public.service_events_status();

-- Al crear, cambiar o quitar una cancelación se actualizan los servicios afectados.
create function public.service_cancellations_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if tg_op = 'DELETE' or tg_op = 'UPDATE' then
    update public.service_events e
       set status = case when public.cancellation_reason_for(e.slot_id, e.service_date) is null then 'programado'::public.service_event_status else 'cancelado' end,
           cancel_reason = nullif(public.cancellation_reason_for(e.slot_id, e.service_date), ''), updated_at = now()
     where e.service_date = old.service_date
       and (old.slot_id is null or e.slot_id = old.slot_id)
       and (old.site_id is null or e.slot_id in (select s.id from public.service_slots s where s.site_id = old.site_id));
  end if;
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    update public.service_events e
       set status = case when public.cancellation_reason_for(e.slot_id, e.service_date) is null then 'programado'::public.service_event_status else 'cancelado' end,
           cancel_reason = nullif(public.cancellation_reason_for(e.slot_id, e.service_date), ''), updated_at = now()
     where e.service_date = new.service_date
       and (new.slot_id is null or e.slot_id = new.slot_id)
       and (new.site_id is null or e.slot_id in (select s.id from public.service_slots s where s.site_id = new.site_id));
  end if;
  return null;
end $$;
create trigger service_cancellations_sync after insert or update or delete on public.service_cancellations
  for each row execute function public.service_cancellations_sync();

-- El horario de una cancelación fija su sede.
create function public.service_cancellations_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slot_id is not null then
    new.site_id := public.slot_site_id(new.slot_id);
  end if;
  return new;
end $$;
create trigger service_cancellations_prepare before insert or update on public.service_cancellations
  for each row execute function public.service_cancellations_prepare();

-- ───────────── Integridad de la planeación ─────────────
-- Si cambia el grupo que sirve, la planeación del grupo anterior ya no vale.
create function public.service_events_group_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.group_id is distinct from old.group_id then
    delete from public.service_assignments where event_id = new.id;
    delete from public.service_position_notes where event_id = new.id;
    delete from public.service_plans where event_id = new.id;
  end if;
  return null;
end $$;
create trigger service_events_group_changed after update of group_id on public.service_events
  for each row execute function public.service_events_group_changed();

create trigger service_events_touch before update on public.service_events for each row execute function public.touch_updated_at();

-- Una asignación solo es válida si la persona es del grupo que sirve, la posición es de esa sede y aplica a ese
-- día y franja, y las posiciones de supervisor solo van a supervisores (o coordinadores).
create function public.service_assignments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ev record; pos record; v_role public.group_role;
begin
  select e.group_id, s.site_id, s.day, s.shift into ev
    from public.service_events e join public.service_slots s on s.id = e.slot_id where e.id = new.event_id;
  if ev.group_id is null then
    raise exception 'Este servicio todavía no tiene un grupo asignado' using errcode = 'check_violation';
  end if;
  select m.role into v_role from public.memberships m where m.user_id = new.user_id and m.group_id = ev.group_id;
  if v_role is null then
    raise exception 'La persona no pertenece al grupo que sirve ese día' using errcode = 'check_violation';
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
  if pos.kind = 'supervisor' and v_role = 'voluntario' then
    raise exception 'Las posiciones de supervisor solo se asignan a supervisores o coordinadores' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger service_assignments_guard before insert or update on public.service_assignments
  for each row execute function public.service_assignments_guard();

create function public.service_notes_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.position_site_id(new.position_id) is distinct from public.event_site_id(new.event_id) then
    raise exception 'La posición no es de la sede de este servicio' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger service_notes_guard before insert or update on public.service_position_notes
  for each row execute function public.service_notes_guard();

-- Quien sale del grupo (o deja de ser supervisor) pierde sus asignaciones de servicios que aún no han pasado;
-- las pasadas se conservan como historial.
create function public.memberships_clean_assignments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.group_id is distinct from old.group_id then
    delete from public.service_assignments a using public.service_events e
     where a.event_id = e.id and a.user_id = old.user_id and e.group_id = old.group_id and e.service_date >= public.today_co();
  elsif new.role = 'voluntario' and old.role <> 'voluntario' then
    delete from public.service_assignments a using public.service_events e, public.positions p
     where a.event_id = e.id and a.position_id = p.id and a.user_id = old.user_id and e.group_id = old.group_id
       and e.service_date >= public.today_co() and p.kind = 'supervisor';
  end if;
  return null;
end $$;
create trigger memberships_clean_assignments after update or delete on public.memberships
  for each row execute function public.memberships_clean_assignments();

create function public.service_plans_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status <> 'publicado') then
    new.published_at := now();
    new.published_by := auth.uid();
  elsif new.status = 'borrador' then
    new.published_at := null;
    new.published_by := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger service_plans_prepare before insert or update on public.service_plans
  for each row execute function public.service_plans_prepare();

-- ───────────── Generar la rotación ─────────────
-- Para un horario, crea los servicios semanales entre dos fechas. El grupo de cada fecha sale del turno: la fecha siguiente a la
-- última ya generada continúa la secuencia; si no hay ninguna, empieza el primer grupo del orden (o el elegido).
-- No toca los ajustados a mano ni los especiales. Un servicio que ya tiene planeación o archivos conserva su grupo.
create function public.generate_service_events(p_slot uuid, p_from date, p_until date, p_first_group uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_slot public.service_slots;
  v_groups uuid[];
  v_n int; v_dow int; v_d date; v_turn int; v_prev int;
  v_created int := 0; v_updated int := 0; v_protected int := 0; v_kept int := 0;
  v_ev public.service_events; v_gid uuid;
begin
  select * into v_slot from public.service_slots s where s.id = p_slot;
  if not found then raise exception 'El horario no existe' using errcode = 'no_data_found'; end if;
  if not public.can_manage_site(v_slot.site_id) then
    raise exception 'No tienes permiso para generar servicios en esta sede' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_until is null or p_until < p_from then
    raise exception 'La fecha final debe ser igual o posterior a la inicial' using errcode = 'check_violation';
  end if;
  if p_until - p_from > 400 then
    raise exception 'Genera máximo 400 días por vez' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(g.id order by g.rotation_order, g.created_at, g.name), '{}') into v_groups
    from public.groups g where g.service_slot_id = p_slot;
  v_n := cardinality(v_groups);
  if v_n = 0 then raise exception 'Este horario no tiene grupos' using errcode = 'check_violation'; end if;

  v_dow := case v_slot.day when 'miercoles' then 3 when 'sabado' then 6 else 0 end;
  v_d := p_from + ((v_dow - extract(dow from p_from)::int + 7) % 7);

  select e.turn into v_prev from public.service_events e
   where e.slot_id = p_slot and e.kind = 'rotacion' and e.service_date < v_d
   order by e.service_date desc limit 1;
  v_turn := case
    when v_prev is not null then (v_prev + 1) % v_n
    when p_first_group is not null and p_first_group = any (v_groups) then array_position(v_groups, p_first_group) - 1
    else 0 end;

  while v_d <= p_until loop
    v_gid := v_groups[v_turn + 1];
    select * into v_ev from public.service_events e where e.slot_id = p_slot and e.service_date = v_d;
    if not found then
      insert into public.service_events (slot_id, service_date, group_id, kind, turn) values (p_slot, v_d, v_gid, 'rotacion', v_turn);
      v_created := v_created + 1;
    elsif v_ev.kind <> 'rotacion' or v_ev.manual then
      v_kept := v_kept + 1;
    elsif v_ev.group_id is distinct from v_gid or v_ev.turn is distinct from v_turn then
      if v_ev.group_id is distinct from v_gid and (
           exists (select 1 from public.service_plans p where p.event_id = v_ev.id)
        or exists (select 1 from public.schedule_files f where f.event_id = v_ev.id)) then
        v_protected := v_protected + 1;
      else
        update public.service_events set group_id = v_gid, turn = v_turn where id = v_ev.id;
        v_updated := v_updated + 1;
      end if;
    end if;
    v_turn := (v_turn + 1) % v_n;     -- cada fecha consume un turno, esté o no cancelada
    v_d := v_d + 7;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'protected', v_protected, 'kept', v_kept);
end $$;

-- Cambiar a mano quién sirve en una fecha (intercambio o caso especial). La rotación ya no la toca.
create function public.set_event_group(p_event uuid, p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ev public.service_events;
begin
  select * into v_ev from public.service_events e where e.id = p_event;
  if not found then raise exception 'El servicio no existe' using errcode = 'no_data_found'; end if;
  if not public.can_manage_site(public.slot_site_id(v_ev.slot_id)) then
    raise exception 'No tienes permiso para cambiar este servicio' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group and g.service_slot_id = v_ev.slot_id) then
    raise exception 'El grupo debe ser de este mismo horario' using errcode = 'check_violation';
  end if;
  update public.service_events set group_id = p_group, manual = true where id = p_event;
end $$;

-- Volver a lo que dice la rotación.
create function public.reset_event_group(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ev public.service_events; v_groups uuid[];
begin
  select * into v_ev from public.service_events e where e.id = p_event;
  if not found then raise exception 'El servicio no existe' using errcode = 'no_data_found'; end if;
  if not public.can_manage_site(public.slot_site_id(v_ev.slot_id)) then
    raise exception 'No tienes permiso para cambiar este servicio' using errcode = 'insufficient_privilege';
  end if;
  if v_ev.kind <> 'rotacion' then raise exception 'Un servicio especial no sigue la rotación' using errcode = 'check_violation'; end if;
  select coalesce(array_agg(g.id order by g.rotation_order, g.created_at, g.name), '{}') into v_groups from public.groups g where g.service_slot_id = v_ev.slot_id;
  if cardinality(v_groups) = 0 then raise exception 'Este horario no tiene grupos' using errcode = 'check_violation'; end if;
  update public.service_events set group_id = v_groups[(v_ev.turn % cardinality(v_groups)) + 1], manual = false where id = p_event;
end $$;

-- Servicio fuera de la rotación (por ejemplo, un viernes especial).
create function public.create_special_event(p_slot uuid, p_date date, p_group uuid, p_note text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_manage_site(public.slot_site_id(p_slot)) then
    raise exception 'No tienes permiso para crear servicios en esta sede' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group and g.service_slot_id = p_slot) then
    raise exception 'El grupo debe ser de este mismo horario' using errcode = 'check_violation';
  end if;
  insert into public.service_events (slot_id, service_date, group_id, kind, manual, note)
  values (p_slot, p_date, p_group, 'especial', true, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ───────────── RLS ─────────────
alter table public.service_events        enable row level security;
alter table public.service_cancellations enable row level security;
alter table public.service_plans         enable row level security;
alter table public.service_assignments   enable row level security;
alter table public.service_position_notes enable row level security;
alter table public.schedule_files        enable row level security;
revoke all on public.service_events, public.service_cancellations, public.service_plans, public.service_assignments,
              public.service_position_notes, public.schedule_files from anon;

-- Servicios: solo se cambian con las funciones de arriba (el cliente solo puede editar la nota y borrar los especiales).
revoke insert, update on public.service_events from authenticated;
grant update (note) on public.service_events to authenticated;
create policy service_events_select on public.service_events for select to authenticated
  using (
    (group_id is not null and public.can_view_group(group_id))
    or public.can_manage_site(public.slot_site_id(slot_id))
    or exists (select 1 from public.service_assignments a where a.event_id = service_events.id and a.user_id = auth.uid() and public.plan_is_published(a.event_id))
  );
create policy service_events_update on public.service_events for update to authenticated
  using (public.can_manage_site(public.slot_site_id(slot_id))) with check (public.can_manage_site(public.slot_site_id(slot_id)));
create policy service_events_delete on public.service_events for delete to authenticated
  using (kind = 'especial' and public.can_manage_site(public.slot_site_id(slot_id)));

-- Cancelaciones: el líder las de su sede; las de todas las sedes, solo cabeza y admin.
create policy cancellations_select on public.service_cancellations for select to authenticated
  using (
    public.is_admin_or_head()
    or (site_id is null and exists (select 1 from public.site_leaders sl where sl.user_id = auth.uid()))
    or (site_id is not null and public.can_manage_site(site_id))
  );
create policy cancellations_write on public.service_cancellations for all to authenticated
  using      (case when site_id is null then public.is_admin_or_head() else public.can_manage_site(site_id) end)
  with check (case when slot_id is not null then public.can_manage_site(public.slot_site_id(slot_id))
                   when site_id is null then public.is_admin_or_head() else public.can_manage_site(site_id) end);

-- Planeación: el borrador lo ven y editan quienes planifican; publicada, la ve todo el grupo (y cada persona la suya).
create policy service_plans_select on public.service_plans for select to authenticated
  using (public.can_plan_event(event_id) or (status = 'publicado' and public.is_event_member(event_id)));
create policy service_plans_write on public.service_plans for all to authenticated
  using (public.can_plan_event(event_id)) with check (public.can_plan_event(event_id));

create policy assignments_select on public.service_assignments for select to authenticated
  using (public.can_plan_event(event_id) or (public.plan_is_published(event_id) and (public.is_event_member(event_id) or user_id = auth.uid())));
create policy assignments_write on public.service_assignments for all to authenticated
  using (public.can_plan_event(event_id)) with check (public.can_plan_event(event_id));

create policy position_notes_select on public.service_position_notes for select to authenticated
  using (public.can_plan_event(event_id) or (public.plan_is_published(event_id) and public.is_event_member(event_id)));
create policy position_notes_write on public.service_position_notes for all to authenticated
  using (public.can_plan_event(event_id)) with check (public.can_plan_event(event_id));

-- Archivos: los ve todo el grupo; los sube y quita quien planifica.
create policy schedule_files_select on public.schedule_files for select to authenticated
  using (public.can_plan_event(event_id) or public.is_event_member(event_id));
create policy schedule_files_write on public.schedule_files for all to authenticated
  using (public.can_plan_event(event_id)) with check (public.can_plan_event(event_id));

-- ───────────── Storage: bucket privado «schedules» (ruta: sede/servicio/archivo) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schedules', 'schedules', false, 10485760, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy schedules_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'schedules' and (
    public.can_plan_event(public.safe_uuid((storage.foldername(name))[2])) or public.is_event_member(public.safe_uuid((storage.foldername(name))[2]))));
create policy schedules_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'schedules' and public.can_plan_event(public.safe_uuid((storage.foldername(name))[2])));
create policy schedules_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'schedules' and public.can_plan_event(public.safe_uuid((storage.foldername(name))[2])))
  with check (bucket_id = 'schedules' and public.can_plan_event(public.safe_uuid((storage.foldername(name))[2])));
create policy schedules_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'schedules' and public.can_plan_event(public.safe_uuid((storage.foldername(name))[2])));

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
