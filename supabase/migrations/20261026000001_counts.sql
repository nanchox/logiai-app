-- LogiAI · Fase 8 · Conteos y totales: capacidad por ubicación, guía de conteo (imagen) por sede y día, totales por servicio

-- ───────────── Capacidad ─────────────
-- Total de sillas de la ubicación (una cifra para todos los servicios). La edita quien ya edita las ubicaciones (líder, cabeza, admin).
alter table public.locations add column capacity int check (capacity is null or capacity between 0 and 100000);

-- ───────────── Guía de conteo: una imagen por sede y día de la semana, que se repite cada semana ─────────────
create table public.count_guides (
  site_id    uuid not null references public.sites(id) on delete cascade,
  day        public.service_day not null,
  image_path text not null unique,                       -- ruta en el bucket «counts»: sede/día/archivo
  note       text check (char_length(note) <= 300),
  updated_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (site_id, day)
);
create index count_guides_updated_by_idx on public.count_guides (updated_by);

-- ───────────── Totales contados por servicio y ubicación (un total final) ─────────────
create table public.service_counts (
  event_id    uuid not null references public.service_events(id) on delete cascade,
  location_id uuid not null references public.locations(id)      on delete cascade,
  total       int  not null check (total >= 0),
  counted_by  uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (event_id, location_id)
);
create index service_counts_location_idx   on public.service_counts (location_id);
create index service_counts_counted_by_idx on public.service_counts (counted_by);

-- Quién cambió qué y cuándo (todos los cambios).
create table public.service_count_log (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.service_events(id) on delete cascade,
  location_id uuid not null references public.locations(id)      on delete cascade,
  old_total   int,
  new_total   int,
  changed_by  uuid references public.profiles(user_id) on delete set null,
  changed_at  timestamptz not null default now()
);
create index service_count_log_event_idx      on public.service_count_log (event_id);
create index service_count_log_location_idx   on public.service_count_log (location_id);
create index service_count_log_changed_by_idx on public.service_count_log (changed_by);

-- ───────────── Reglas ─────────────
create function public.safe_service_day(p text) returns public.service_day
language sql immutable set search_path = '' as $$
  select case when p in ('miercoles', 'sabado', 'domingo') then p::public.service_day end
$$;

-- La guía la ven quienes sirven ese día en esa sede (o apoyan), y el líder, la cabeza y el administrador.
create function public.can_view_count_guide(p_site uuid, p_day public.service_day) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_site is not null and p_day is not null and (
    public.can_manage_site(p_site)
    or exists (
      select 1 from public.memberships m
      join public.groups g on g.id = m.group_id
      join public.service_slots s on s.id = g.service_slot_id
      where m.user_id = auth.uid() and s.site_id = p_site and s.day = p_day)
    or exists (
      select 1 from public.service_supporters sp
      join public.service_events e on e.id = sp.event_id
      join public.service_slots s on s.id = e.slot_id
      where sp.user_id = auth.uid() and s.site_id = p_site and s.day = p_day))
$$;

-- Registra o corrige los conteos de un servicio: desde el día del servicio; quien planifica (coordinador o supervisor del grupo que
-- sirvió) hasta el final del día siguiente (24 horas después); después, solo el líder de la sede, la cabeza o el administrador.
create function public.can_count_event(p_event uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.service_events e join public.service_slots s on s.id = e.slot_id
    where e.id = p_event and e.status = 'programado' and e.group_id is not null and e.service_date <= public.today_co()
      and (public.can_manage_site(s.site_id)
           or (public.can_plan_event(p_event) and public.today_co() <= e.service_date + 1)))
$$;

-- El total debe ser de una ubicación de la sede del servicio, con capacidad registrada, y no puede superarla.
create function public.service_counts_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cap int; v_name text;
begin
  select l.capacity, l.name into v_cap, v_name from public.locations l where l.id = new.location_id;
  if public.location_site_id(new.location_id) is distinct from public.event_site_id(new.event_id) then
    raise exception 'La ubicación no es de la sede de este servicio' using errcode = 'check_violation';
  end if;
  if v_cap is null then
    raise exception 'La ubicación «%» todavía no tiene su capacidad registrada', v_name using errcode = 'check_violation';
  end if;
  if new.total > v_cap then
    raise exception 'El total de «%» (%) no puede superar su capacidad (%)', v_name, new.total, v_cap using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger service_counts_guard before insert or update on public.service_counts for each row execute function public.service_counts_guard();

create function public.service_counts_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_event uuid := coalesce(new.event_id, old.event_id); v_loc uuid := coalesce(new.location_id, old.location_id);
begin
  -- Sin cambio de total (por ejemplo, al borrar a quien contó) no hay nada que registrar.
  if tg_op = 'UPDATE' and new.total = old.total then return null; end if;
  -- Si el servicio o la ubicación se están eliminando, tampoco.
  if exists (select 1 from public.service_events e where e.id = v_event) and exists (select 1 from public.locations l where l.id = v_loc) then
    insert into public.service_count_log (event_id, location_id, old_total, new_total, changed_by)
    values (v_event, v_loc, case when tg_op = 'INSERT' then null else old.total end, case when tg_op = 'DELETE' then null else new.total end,
            (select p.user_id from public.profiles p where p.user_id = auth.uid()));
  end if;
  return null;
end $$;
create trigger service_counts_log after insert or update or delete on public.service_counts for each row execute function public.service_counts_log();

-- La capacidad de una ubicación no puede quedar por debajo de un total ya registrado (ni borrarse si hay totales).
create function public.locations_capacity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max int;
begin
  select max(c.total) into v_max from public.service_counts c where c.location_id = new.id;
  if v_max is not null and (new.capacity is null or new.capacity < v_max) then
    raise exception 'Hay conteos registrados de hasta % personas en «%»: la capacidad no puede ser menor', v_max, new.name using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger locations_capacity_guard before update of capacity on public.locations for each row execute function public.locations_capacity_guard();

-- ───────────── Funciones que usa la aplicación ─────────────
-- Guarda los totales de un servicio de una sola vez: [{"location_id": "…", "total": 120}, …]. Un total nulo borra el de esa ubicación.
-- Todo o nada: si uno no es válido, no se guarda ninguno.
create function public.save_counts(p_event uuid, p_counts jsonb) returns void
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
      delete from public.service_counts where event_id = p_event and location_id = v_loc;
    else
      if jsonb_typeof(v_total) <> 'number' or v_total::text !~ '^[0-9]{1,6}$' then
        raise exception 'El total debe ser un número entero de cero en adelante' using errcode = 'check_violation';
      end if;
      insert into public.service_counts (event_id, location_id, total) values (p_event, v_loc, (v_total::text)::int)
      on conflict (event_id, location_id) do update set total = excluded.total, counted_by = auth.uid()
        where public.service_counts.total is distinct from excluded.total;
    end if;
  end loop;
end $$;

-- Historial de cambios de los conteos de un servicio, para el líder de la sede, la cabeza y el administrador.
create function public.count_log(p_event uuid)
returns table (changed_at timestamptz, full_name text, location_name text, old_total int, new_total int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_site(public.event_site_id(p_event)) then
    raise exception 'No tienes permiso para ver este historial' using errcode = 'insufficient_privilege';
  end if;
  return query
    select g.changed_at, p.full_name, l.name, g.old_total, g.new_total
    from public.service_count_log g
    join public.locations l on l.id = g.location_id
    left join public.profiles p on p.user_id = g.changed_by
    where g.event_id = p_event
    order by g.changed_at desc, l.name;
end $$;

-- ───────────── RLS ─────────────
alter table public.count_guides       enable row level security;
alter table public.service_counts     enable row level security;
alter table public.service_count_log  enable row level security;
revoke all on public.count_guides, public.service_counts, public.service_count_log from anon, authenticated;
grant select, insert, update, delete on public.count_guides to authenticated;
grant select on public.service_counts, public.service_count_log to authenticated;   -- los totales se escriben con save_counts()

create policy count_guides_select on public.count_guides for select to authenticated using (public.can_view_count_guide(site_id, day));
create policy count_guides_write  on public.count_guides for all    to authenticated
  using (public.can_manage_site(site_id)) with check (public.can_manage_site(site_id));
-- Los totales los ven quienes planifican ese servicio (coordinador y supervisor del grupo, líder de la sede, cabeza y administrador).
create policy service_counts_select on public.service_counts for select to authenticated using (public.can_plan_event(event_id));
create policy service_count_log_select on public.service_count_log for select to authenticated using (public.can_manage_site(public.event_site_id(event_id)));

-- Storage: bucket privado «counts» (ruta: sede/día/archivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('counts', 'counts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy counts_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'counts' and public.can_view_count_guide(public.site_id_by_slug((storage.foldername(name))[1]), public.safe_service_day((storage.foldername(name))[2])));
create policy counts_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'counts' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
create policy counts_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'counts' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])))
  with check (bucket_id = 'counts' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
create policy counts_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'counts' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));

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
