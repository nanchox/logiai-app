-- LogiAI · Minimización de datos: ya no se guarda la foto de la cuenta de Google (la aplicación nunca la mostraba)

-- El alta guarda solo el nombre (perfil) y el correo (tabla privada).
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

  if inv.group_id is not null then
    insert into public.memberships (user_id, group_id, role) values (new.id, inv.group_id, inv.group_role);
  end if;

  update public.invitations set accepted_at = now() where id = inv.id;
  return new;
end $$;

-- Se borran las fotos que ya se hubieran guardado.
alter table public.profiles drop column avatar_url;
