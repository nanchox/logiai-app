-- LogiAI · Posición de conteo: una posición del manual puede estar ligada a una entrada de su ubicación. Quien la ocupa en el servicio
-- cuenta en esa entrada con el contador digital. Aditiva.

alter table public.positions add column entrance_id uuid references public.entrances(id) on delete set null;
create index positions_entrance_idx on public.positions (entrance_id);

-- La entrada debe ser de la misma ubicación que la posición.
create function public.positions_entrance_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.entrance_id is not null and not exists (select 1 from public.entrances e where e.id = new.entrance_id and e.location_id = new.location_id) then
    raise exception 'La entrada debe ser de la misma ubicación que la posición' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger positions_entrance_guard before insert or update of entrance_id, location_id on public.positions for each row execute function public.positions_entrance_guard();

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
