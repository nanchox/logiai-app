-- LogiAI · Fase 1 · Acceso por invitación
-- 1) Hook "Before User Created" (Authentication → Hooks): rechaza correos sin invitación con un mensaje claro.
-- 2) Trigger en auth.users: segunda barrera (bloquea aunque el hook no esté activado) y crea perfil, líder y membresía.

create function public.hook_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if v_email is null or not exists (select 1 from public.invitations i where i.email = v_email) then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Este correo no está autorizado. Pide a tu coordinador o líder de sede que te agregue.',
      'http_code', 403));
  end if;
  return '{}'::jsonb;
end $$;

revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
begin
  select * into inv from public.invitations i where i.email = lower(new.email);
  if not found then
    raise exception 'Correo no autorizado: %', new.email using errcode = 'insufficient_privilege';
  end if;

  insert into public.profiles (user_id, email, full_name, avatar_url, is_admin, is_head)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    inv.is_admin,
    inv.is_head);

  insert into public.site_leaders (user_id, site_id)
  select new.id, s.id from public.sites s where s.id = any (inv.leader_site_ids);

  if inv.group_id is not null then
    insert into public.memberships (user_id, group_id, role) values (new.id, inv.group_id, inv.group_role);
  end if;

  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
