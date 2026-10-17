-- LogiAI · Cierre de fases 1 y 2 · Endurecimiento de permisos e índices

-- 1) Las funciones auxiliares eran ejecutables por cualquiera, incluso sin sesión (rol anon), a través de
--    /rest/v1/rpc/…. Ahora: solo usuarios con sesión (authenticated) las ejecutan; las funciones de trigger
--    no las ejecuta nadie directamente (el trigger no necesita ese permiso); el hook de Auth ya estaba cerrado.
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

-- Las funciones que se creen en migraciones futuras nacen sin permiso para anon ni PUBLIC.
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;

alter function public.touch_updated_at() set search_path = '';

-- 2) Claves foráneas sin índice (más lentas al borrar o filtrar a medida que crecen los datos).
create index flow_steps_location_idx on public.flow_steps (location_id);
create index invitations_group_idx   on public.invitations (group_id);
create index invitations_inviter_idx on public.invitations (invited_by);
create index maps_zone_idx           on public.maps (zone_id, location_id);
create index positions_zone_idx      on public.positions (zone_id, location_id);
create index site_leaders_site_idx   on public.site_leaders (site_id);
