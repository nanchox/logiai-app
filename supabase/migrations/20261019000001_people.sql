-- LogiAI · Fase 3 · Personas y grupos
-- 1) Los correos pasan a una tabla privada: solo los ve la propia persona y quien la administra.
-- 2) Eliminar a una persona de la aplicación (cuenta + invitación) con una función que valida los permisos.
-- 3) Los líderes de sede también administran los horarios de su sede; no se puede borrar un grupo con integrantes.

-- ───────────── 1. Correos privados ─────────────
create table public.profile_private (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  email   text not null unique check (email = lower(email))
);
insert into public.profile_private (user_id, email) select user_id, email from public.profiles;
alter table public.profiles drop column email;

-- Persona con grupo: cabeza/admin, líder de la sede, o coordinador de su grupo (si no es coordinador).
-- Las personas sin grupo (líderes, cabeza, admin) solo las administran la cabeza y el admin.
create function public.can_manage_person(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    public.is_admin_or_head()
    or exists (
      select 1 from public.memberships m
      where m.user_id = p_user and public.can_assign_role(m.group_id, m.role))
  )
$$;

alter table public.profile_private enable row level security;
revoke all on public.profile_private from anon;
revoke insert, update, delete on public.profile_private from authenticated;
create policy profile_private_select on public.profile_private for select to authenticated
  using (user_id = auth.uid() or public.can_manage_person(user_id));

-- El alta ahora guarda el correo en la tabla privada.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations i where i.email = lower(new.email);
  if not found then
    raise exception 'Correo no autorizado: %', new.email using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (user_id, full_name, avatar_url, is_admin, is_head)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    inv.is_admin,
    inv.is_head);
  insert into public.profile_private (user_id, email) values (new.id, lower(new.email));

  insert into public.site_leaders (user_id, site_id)
  select new.id, s.id from public.sites s where s.id = any (inv.leader_site_ids);

  if inv.group_id is not null then
    insert into public.memberships (user_id, group_id, role) values (new.id, inv.group_id, inv.group_role);
  end if;

  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;

-- ───────────── 2. Eliminar a una persona de la aplicación ─────────────
-- Admin/cabeza: cualquier persona (solo el admin puede eliminar a otro admin o a la cabeza). Líder de sede: las personas
-- de sus grupos. Coordinador: supervisores y voluntarios de su grupo. Nadie puede eliminarse a sí mismo.
create function public.can_delete_person(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_user is distinct from auth.uid() and case
    when exists (select 1 from public.profiles p where p.user_id = p_user and (p.is_admin or p.is_head)) then public.is_admin()
    when exists (select 1 from public.site_leaders sl where sl.user_id = p_user) then public.is_admin_or_head()
    else public.can_manage_person(p_user)
  end
$$;

-- Borra la invitación (si no, esa persona podría volver a entrar con Google) y la cuenta; en cascada se van su perfil,
-- su correo, su grupo y sus sesiones.
create function public.delete_person(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if not exists (select 1 from public.profiles p where p.user_id = p_user) then
    raise exception 'La persona no existe' using errcode = 'no_data_found';
  end if;
  -- Solo un administrador elimina a otro administrador y nadie se elimina a sí mismo: siempre queda al menos uno.
  if not public.can_delete_person(p_user) then
    raise exception 'No tienes permiso para eliminar a esta persona' using errcode = 'insufficient_privilege';
  end if;

  select pp.email into v_email from public.profile_private pp where pp.user_id = p_user;
  delete from public.invitations where email = v_email;
  delete from auth.users where id = p_user;
end $$;

-- ───────────── 3. Horarios y grupos ─────────────
drop policy slots_write on public.service_slots;
create policy slots_write on public.service_slots for all to authenticated
  using (public.can_manage_site(site_id)) with check (public.can_manage_site(site_id));

-- Borrar un grupo (o un horario, o una sede) con integrantes dejaría a esas personas sin grupo: se bloquea.
create function public.groups_delete_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.memberships m where m.group_id = old.id) then
    raise exception 'El grupo "%" tiene integrantes: muévelos a otro grupo antes de eliminarlo', old.name
      using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger groups_delete_guard before delete on public.groups
  for each row execute function public.groups_delete_guard();

-- ───────────── Permisos de las funciones (igual que en la migración de endurecimiento) ─────────────
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

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
