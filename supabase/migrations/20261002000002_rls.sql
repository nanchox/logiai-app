-- LogiAI · Fase 1 · Funciones de permisos, reglas de integridad y políticas RLS
-- Las funciones son SECURITY DEFINER para consultar tablas protegidas sin recursión de políticas.

-- ───────────── Funciones auxiliares ─────────────
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false)
$$;

create function public.is_admin_or_head() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin or p.is_head from public.profiles p where p.user_id = auth.uid()), false)
$$;

create function public.is_site_leader(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.site_leaders sl where sl.user_id = auth.uid() and sl.site_id = p_site)
$$;

create function public.my_group_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.group_id from public.memberships m where m.user_id = auth.uid()
$$;

create function public.my_group_role() returns public.group_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m where m.user_id = auth.uid()
$$;

create function public.group_site_id(p_group uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.site_id from public.groups g join public.service_slots s on s.id = g.service_slot_id where g.id = p_group
$$;

create function public.slot_site_id(p_slot uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.site_id from public.service_slots s where s.id = p_slot
$$;

create function public.location_site_id(p_location uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.site_id from public.locations l where l.id = p_location
$$;

create function public.map_site_id(p_map uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.site_id from public.maps m join public.locations l on l.id = m.location_id where m.id = p_map
$$;

create function public.position_site_id(p_position uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.site_id from public.positions p join public.locations l on l.id = p.location_id where p.id = p_position
$$;

create function public.site_id_by_slug(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.sites s where s.slug = p_slug
$$;

-- Ver una sede: cabeza/admin, líder de esa sede o miembro de un grupo de esa sede.
create function public.can_view_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_site is not null and (
    public.is_admin_or_head()
    or public.is_site_leader(p_site)
    or exists (
      select 1 from public.memberships m
      join public.groups g on g.id = m.group_id
      join public.service_slots s on s.id = g.service_slot_id
      where m.user_id = auth.uid() and s.site_id = p_site)
  )
$$;

-- Editar contenido de una sede: cabeza/admin o líder de esa sede.
create function public.can_manage_site(p_site uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_site is not null and (public.is_admin_or_head() or public.is_site_leader(p_site))
$$;

-- Ver un grupo: cabeza/admin, líder de su sede o miembro del grupo.
create function public.can_view_group(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_group is not null and (
    public.is_admin_or_head()
    or public.is_site_leader(public.group_site_id(p_group))
    or public.my_group_id() = p_group
  )
$$;

-- Asignar un rol en un grupo: cabeza/admin y líder de la sede cualquier rol;
-- el coordinador solo supervisores y voluntarios de su propio grupo.
create function public.can_assign_role(p_group uuid, p_role public.group_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_group is not null and (
    public.is_admin_or_head()
    or public.is_site_leader(public.group_site_id(p_group))
    or (public.my_group_id() = p_group and public.my_group_role() = 'coordinador' and p_role <> 'coordinador')
  )
$$;

-- Ver el perfil de otra persona: uno mismo, cabeza/admin, o alguien de un grupo que yo puedo ver.
create function public.can_view_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
    or public.is_admin_or_head()
    or exists (select 1 from public.memberships m where m.user_id = p_user and public.can_view_group(m.group_id))
    or exists (select 1 from public.site_leaders sl where sl.user_id = p_user and public.is_site_leader(sl.site_id))
$$;

-- ───────────── Reglas de integridad ─────────────
-- Máximo 2 coordinadores por grupo; admin, cabeza y líderes de sede no pueden estar en un grupo.
create function public.memberships_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.user_id = new.user_id and (p.is_admin or p.is_head))
     or exists (select 1 from public.site_leaders sl where sl.user_id = new.user_id) then
    raise exception 'El administrador, la cabeza de ministerio y los líderes de sede no pertenecen a ningún grupo'
      using errcode = 'check_violation';
  end if;

  if new.role = 'coordinador' then
    perform pg_advisory_xact_lock(hashtext(new.group_id::text));
    if (select count(*) from public.memberships m
        where m.group_id = new.group_id and m.role = 'coordinador' and m.user_id <> new.user_id) >= 2 then
      raise exception 'Un grupo solo puede tener 2 coordinadores' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger memberships_guard before insert or update on public.memberships
  for each row execute function public.memberships_guard();

create function public.site_leaders_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.memberships m where m.user_id = new.user_id) then
    raise exception 'Un líder de sede no puede pertenecer a un grupo' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger site_leaders_guard before insert on public.site_leaders
  for each row execute function public.site_leaders_guard();

-- ───────────── Permisos de tabla ─────────────
revoke all on all tables in schema public from anon;
revoke update on public.profiles from authenticated;
grant  update (full_name, avatar_url) on public.profiles to authenticated;   -- los roles solo cambian con service_role / SQL

-- ───────────── RLS ─────────────
alter table public.sites            enable row level security;
alter table public.service_slots    enable row level security;
alter table public.groups           enable row level security;
alter table public.profiles         enable row level security;
alter table public.site_leaders     enable row level security;
alter table public.memberships      enable row level security;
alter table public.invitations      enable row level security;
alter table public.locations        enable row level security;
alter table public.zones            enable row level security;
alter table public.maps             enable row level security;
alter table public.positions        enable row level security;
alter table public.position_markers enable row level security;

-- sites
create policy sites_select on public.sites for select to authenticated using (public.can_view_site(id));
create policy sites_write  on public.sites for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- service_slots
create policy slots_select on public.service_slots for select to authenticated using (public.can_view_site(site_id));
create policy slots_write  on public.service_slots for all    to authenticated
  using (public.is_admin_or_head()) with check (public.is_admin_or_head());

-- groups
create policy groups_select on public.groups for select to authenticated using (public.can_view_group(id));
create policy groups_write  on public.groups for all    to authenticated
  using      (public.can_manage_site(public.slot_site_id(service_slot_id)))
  with check (public.can_manage_site(public.slot_site_id(service_slot_id)));

-- profiles (los roles se cambian solo con service_role)
create policy profiles_select on public.profiles for select to authenticated using (public.can_view_profile(user_id));
create policy profiles_update on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- site_leaders
create policy leaders_select on public.site_leaders for select to authenticated
  using (user_id = auth.uid() or public.can_manage_site(site_id));
create policy leaders_write  on public.site_leaders for all to authenticated
  using (public.is_admin_or_head()) with check (public.is_admin_or_head());

-- memberships
create policy memberships_select on public.memberships for select to authenticated using (public.can_view_group(group_id));
create policy memberships_insert on public.memberships for insert to authenticated with check (public.can_assign_role(group_id, role));
create policy memberships_update on public.memberships for update to authenticated
  using (public.can_assign_role(group_id, role)) with check (public.can_assign_role(group_id, role));
create policy memberships_delete on public.memberships for delete to authenticated using (public.can_assign_role(group_id, role));

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (public.is_admin_or_head() or (group_id is not null and public.can_assign_role(group_id, group_role)));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and case
      when is_admin or is_head              then public.is_admin()
      when cardinality(leader_site_ids) > 0 then public.is_admin_or_head()
      else group_id is not null and public.can_assign_role(group_id, group_role)
    end);
create policy invitations_delete on public.invitations for delete to authenticated
  using (accepted_at is null and (public.is_admin_or_head() or (group_id is not null and public.can_assign_role(group_id, group_role))));

-- manual: todos los de la sede lo leen; cabeza/admin y líder de la sede lo editan
create policy locations_select on public.locations for select to authenticated using (public.can_view_site(site_id));
create policy locations_write  on public.locations for all    to authenticated
  using (public.can_manage_site(site_id)) with check (public.can_manage_site(site_id));

create policy zones_select on public.zones for select to authenticated using (public.can_view_site(public.location_site_id(location_id)));
create policy zones_write  on public.zones for all    to authenticated
  using (public.can_manage_site(public.location_site_id(location_id))) with check (public.can_manage_site(public.location_site_id(location_id)));

create policy maps_select on public.maps for select to authenticated using (public.can_view_site(public.location_site_id(location_id)));
create policy maps_write  on public.maps for all    to authenticated
  using (public.can_manage_site(public.location_site_id(location_id))) with check (public.can_manage_site(public.location_site_id(location_id)));

create policy positions_select on public.positions for select to authenticated using (public.can_view_site(public.location_site_id(location_id)));
create policy positions_write  on public.positions for all    to authenticated
  using (public.can_manage_site(public.location_site_id(location_id))) with check (public.can_manage_site(public.location_site_id(location_id)));

create policy markers_select on public.position_markers for select to authenticated using (public.can_view_site(public.position_site_id(position_id)));
create policy markers_write  on public.position_markers for all    to authenticated
  using      (public.can_manage_site(public.position_site_id(position_id)))
  with check (public.can_manage_site(public.position_site_id(position_id)) and public.can_manage_site(public.map_site_id(map_id)));
