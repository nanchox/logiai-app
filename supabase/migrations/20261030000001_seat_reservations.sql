-- LogiAI · Rol adicional «Reservas»: quien lo tiene puede ingresar y registrar reservas de puestos (fecha, zona, fila, número de puestos
-- y para quién). Los coordinadores y supervisores de la sede las ven para saber qué tener en cuenta durante su servicio.
-- El rol es por sede y se puede tener solo o junto con cualquier otro rol. Aditiva.

create table public.site_reservers (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  primary key (user_id, site_id)
);
create index site_reservers_site_idx on public.site_reservers (site_id);

alter table public.invitations add column reserver_site_ids uuid[] not null default '{}';
alter table public.invitations add constraint invitations_reserver_check check (cardinality(reserver_site_ids) = 0 or (not is_admin and not is_head));

create table public.seat_reservations (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  zone_id      uuid not null references public.zones(id) on delete cascade,
  service_date date not null,
  row_label    text not null check (char_length(row_label) between 1 and 20),
  seats        int  not null check (seats between 1 and 10000),
  for_whom     text not null check (char_length(for_whom) between 1 and 120),
  created_by   uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index seat_reservations_site_date_idx  on public.seat_reservations (site_id, service_date);
create index seat_reservations_zone_idx       on public.seat_reservations (zone_id);
create index seat_reservations_created_by_idx on public.seat_reservations (created_by);

-- ───────────── Reglas ─────────────
create function public.is_site_reserver(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.site_reservers r where r.user_id = auth.uid() and r.site_id = p_site)
$$;

-- Quién ve las reservas de una sede: quien administra la sede y los coordinadores y supervisores de sus grupos.
create function public.can_view_seat_reservations(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_site is not null and (
    public.can_manage_site(p_site)
    or exists (
      select 1 from public.memberships m
      join public.groups g on g.id = m.group_id
      join public.service_slots s on s.id = g.service_slot_id
      where m.user_id = auth.uid() and s.site_id = p_site and m.role in ('coordinador', 'supervisor')))
$$;

-- ¿Administra todas estas sedes? (para invitar a quien hará reservas)
create function public.can_manage_sites(p_sites uuid[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select cardinality(p_sites) > 0 and not exists (select 1 from unnest(p_sites) s where not public.can_manage_site(s))
$$;

-- El alta también guarda las sedes en las que la persona hará reservas.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations i where i.email = lower(new.email);
  if not found then
    raise exception 'Correo no autorizado: %', new.email using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (user_id, full_name, is_admin, is_head)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    inv.is_admin,
    inv.is_head);
  insert into public.profile_private (user_id, email) values (new.id, lower(new.email));

  insert into public.site_leaders (user_id, site_id)
  select new.id, s.id from public.sites s where s.id = any (inv.leader_site_ids);
  insert into public.site_reservers (user_id, site_id)
  select new.id, s.id from public.sites s where s.id = any (inv.reserver_site_ids);

  if inv.group_id is not null then
    insert into public.memberships (user_id, group_id, role) values (new.id, inv.group_id, inv.group_role);
  end if;

  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;

-- Quien administra una sede ve el perfil y el correo de quienes hacen reservas en ella, y puede eliminarlos.
create or replace function public.can_view_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
    or public.is_admin_or_head()
    or exists (select 1 from public.memberships m where m.user_id = p_user and public.can_view_group(m.group_id))
    or exists (select 1 from public.site_leaders sl where sl.user_id = p_user and public.is_site_leader(sl.site_id))
    or exists (select 1 from public.site_reservers r where r.user_id = p_user and public.can_manage_site(r.site_id))
$$;

create or replace function public.can_manage_person(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    public.is_admin_or_head()
    or exists (
      select 1 from public.memberships m
      where m.user_id = p_user and public.can_assign_role(m.group_id, m.role))
    or exists (select 1 from public.site_reservers r where r.user_id = p_user and public.can_manage_site(r.site_id))
  )
$$;

create or replace function public.can_delete_person(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_user is distinct from auth.uid() and case
    when exists (select 1 from public.profiles p where p.user_id = p_user and (p.is_admin or p.is_head)) then public.is_admin()
    when exists (select 1 from public.site_leaders sl where sl.user_id = p_user) then public.is_admin_or_head()
    else public.can_manage_person(p_user)
  end
$$;

-- ───────────── Funciones que usa la aplicación ─────────────
-- Zonas en las que la persona puede reservar (de sus sedes), con nombres: quien solo hace reservas no ve el manual.
create function public.reserver_zones()
returns table (site_id uuid, site_name text, zone_id uuid, zone_name text, location_name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, z.id, z.name, l.name
  from public.zones z
  join public.locations l on l.id = z.location_id
  join public.sites s on s.id = l.site_id
  where public.is_site_reserver(s.id) or public.can_manage_site(s.id)
  order by s.sort, l.sort, l.name, z.sort, z.name
$$;

-- Sedes en las que la persona tiene el rol: quien solo reserva no puede leer la tabla de sedes.
create function public.my_reserver_sites() returns table (id uuid, slug text, name text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.slug, s.name from public.site_reservers r join public.sites s on s.id = r.site_id where r.user_id = auth.uid() order by s.sort
$$;

-- Registra una reserva de puestos en una fila de una zona, para una fecha de hoy a 120 días.
create function public.create_seat_reservation(p_zone uuid, p_date date, p_row text, p_seats int, p_for text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_site uuid := public.zone_site_id(p_zone); v_row text := btrim(coalesce(p_row, '')); v_for text := btrim(coalesce(p_for, '')); v_id uuid;
begin
  if v_site is null or not (public.is_site_reserver(v_site) or public.can_manage_site(v_site)) then
    raise exception 'No puedes registrar reservas en esta zona' using errcode = 'insufficient_privilege';
  end if;
  if p_date is null or p_date < public.today_co() or p_date > public.today_co() + 120 then
    raise exception 'La fecha debe ser de hoy en adelante (hasta 120 días)' using errcode = 'check_violation';
  end if;
  if char_length(v_row) not between 1 and 20 then raise exception 'Escribe la fila (máximo 20 caracteres)' using errcode = 'check_violation'; end if;
  if p_seats is null or p_seats not between 1 and 10000 then raise exception 'Los puestos deben ser un número entero de 1 a 10000' using errcode = 'check_violation'; end if;
  if char_length(v_for) not between 1 and 120 then raise exception 'Escribe para quién es la reserva (máximo 120 caracteres)' using errcode = 'check_violation'; end if;
  insert into public.seat_reservations (site_id, zone_id, service_date, row_label, seats, for_whom, created_by)
  values (v_site, p_zone, p_date, v_row, p_seats, v_for, auth.uid()) returning id into v_id;
  return v_id;
end $$;

-- Reservas que la persona puede ver (las suyas, o las de las sedes donde coordina, supervisa o administra) en un rango de fechas.
create function public.seat_reservations_for(p_from date, p_until date)
returns table (id uuid, site_id uuid, site_name text, zone_name text, location_name text, service_date date, row_label text, seats int, for_whom text, created_by_name text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.site_id, s.name, z.name, l.name, r.service_date, r.row_label, r.seats, r.for_whom, p.full_name, r.created_by is not distinct from auth.uid()
  from public.seat_reservations r
  join public.sites s on s.id = r.site_id
  join public.zones z on z.id = r.zone_id
  join public.locations l on l.id = z.location_id
  left join public.profiles p on p.user_id = r.created_by
  where r.service_date between p_from and p_until
    and (r.created_by is not distinct from auth.uid() or public.can_view_seat_reservations(r.site_id))
  order by r.service_date, s.sort, l.sort, l.name, z.sort, z.name, r.row_label, r.created_at
$$;

-- ───────────── RLS ─────────────
alter table public.site_reservers    enable row level security;
alter table public.seat_reservations enable row level security;
revoke all on public.site_reservers, public.seat_reservations from anon, authenticated;
grant select, insert, delete on public.site_reservers to authenticated;
grant select, delete on public.seat_reservations to authenticated;     -- se crean con create_seat_reservation()

create policy site_reservers_select on public.site_reservers for select to authenticated using (user_id = auth.uid() or public.can_manage_site(site_id));
create policy site_reservers_insert on public.site_reservers for insert to authenticated with check (public.can_manage_site(site_id));
create policy site_reservers_delete on public.site_reservers for delete to authenticated using (public.can_manage_site(site_id));

create policy seat_reservations_select on public.seat_reservations for select to authenticated
  using (created_by = auth.uid() or public.can_view_seat_reservations(site_id));
-- Cada quien quita las suyas; quien administra la sede, cualquiera.
create policy seat_reservations_delete on public.seat_reservations for delete to authenticated
  using ((created_by = auth.uid() and service_date >= public.today_co()) or public.can_manage_site(site_id));

-- Invitaciones: quien administra una sede puede invitar a hacer reservas en ella.
drop policy invitations_select on public.invitations;
drop policy invitations_insert on public.invitations;
drop policy invitations_delete on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_admin_or_head()
         or (group_id is not null and public.can_assign_role(group_id, group_role))
         or (cardinality(reserver_site_ids) > 0 and public.can_manage_sites(reserver_site_ids)));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and case
      when is_admin or is_head              then public.is_admin()
      when cardinality(leader_site_ids) > 0 then public.is_admin_or_head()
      when cardinality(reserver_site_ids) > 0 then group_id is null and public.can_manage_sites(reserver_site_ids)
      else group_id is not null and public.can_assign_role(group_id, group_role)
    end);
create policy invitations_delete on public.invitations for delete to authenticated
  using (accepted_at is null and (public.is_admin_or_head()
         or (group_id is not null and public.can_assign_role(group_id, group_role))
         or (cardinality(reserver_site_ids) > 0 and public.can_manage_sites(reserver_site_ids))));

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
