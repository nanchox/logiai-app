-- LogiAI · Protección de datos personales (Ley 1581 de 2012): constancia de aceptación y baja de la cuenta por la propia persona

-- ───────────── Aceptación de la política y de los términos ─────────────
-- Una fila por persona y versión de los textos. Es la constancia de la autorización previa, expresa e informada: la persona
-- la crea al aceptar y no puede cambiarla ni borrarla (si se elimina la cuenta, se va con ella).
create table public.consents (
  user_id        uuid not null references public.profiles(user_id) on delete cascade,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  accepted_at    timestamptz not null default now(),
  primary key (user_id, policy_version)
);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select, insert on public.consents to authenticated;
create policy consents_select on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert on public.consents for insert to authenticated with check (user_id = auth.uid());

-- ───────────── Baja por la propia persona (derecho de supresión y revocatoria) ─────────────
-- Borra la invitación (si no, podría volver a entrar con Google) y la cuenta; en cascada se van su perfil, su correo, su grupo,
-- sus asignaciones, su constancia de aceptación y su conteo del asistente. El administrador y la cabeza no se dan de baja
-- solos: otro administrador lo hace, para que la aplicación nunca se quede sin quien la administre.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_email text;
begin
  if v_me is null then raise exception 'Inicia sesión para continuar' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and (p.is_admin or p.is_head)) then
    raise exception 'El administrador y la cabeza de ministerio no pueden eliminarse a sí mismos: pide a otro administrador que lo haga'
      using errcode = 'insufficient_privilege';
  end if;
  select pp.email into v_email from public.profile_private pp where pp.user_id = v_me;
  delete from public.invitations where email = v_email;
  delete from auth.users where id = v_me;
end $$;

-- Si el autor de una novedad se elimina, la novedad queda pero sin su nombre ni su rol (eran datos personales).
create or replace function public.announcements_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.group_id is not null then
    new.site_id := public.group_site_id(new.group_id);
  end if;

  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    select p.full_name,
           nullif(case
             when p.is_admin then 'Administrador'
             when p.is_head then 'Cabeza de ministerio'
             when exists (select 1 from public.site_leaders sl where sl.user_id = p.user_id) then
               'Líder de ' || (select string_agg(s.name, ', ' order by s.sort) from public.site_leaders sl join public.sites s on s.id = sl.site_id where sl.user_id = p.user_id)
             else coalesce((select initcap(m.role::text) from public.memberships m where m.user_id = p.user_id), '')
           end, '')
      into new.author_name, new.author_role
      from public.profiles p where p.user_id = auth.uid();
  else
    if old.author_id is not null and new.author_id is null
       and not exists (select 1 from public.profiles p where p.user_id = old.author_id) then
      new.author_name := null;      -- el autor fue eliminado
      new.author_role := null;
    else
      new.author_id := old.author_id;
      new.author_name := old.author_name;
      new.author_role := old.author_role;
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
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
