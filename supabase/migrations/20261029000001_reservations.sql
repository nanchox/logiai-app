-- LogiAI · Reservas por zona: puestos reservados en una fila de cada zona.
-- Un valor predeterminado por zona y día de la semana (lo define el líder) que, durante un servicio, quien lo cuenta puede ajustar.
-- Aditiva: hasta aplicarla, los conteos funcionan igual y simplemente no hay reservas.

create function public.zone_site_id(p_zone uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select public.location_site_id(z.location_id) from public.zones z where z.id = p_zone
$$;

-- Predeterminado: puestos reservados de una zona en un día de la semana (se repite cada semana).
create table public.zone_reservation_defaults (
  zone_id    uuid not null references public.zones(id) on delete cascade,
  day        public.service_day not null,
  seats      int  not null check (seats between 0 and 10000),
  updated_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (zone_id, day)
);
create index zone_reservation_defaults_updated_by_idx on public.zone_reservation_defaults (updated_by);

-- Ajuste de un servicio concreto: reemplaza al predeterminado solo ese día.
create table public.service_reservations (
  event_id   uuid not null references public.service_events(id) on delete cascade,
  zone_id    uuid not null references public.zones(id) on delete cascade,
  seats      int  not null check (seats between 0 and 10000),
  updated_by uuid references public.profiles(user_id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (event_id, zone_id)
);
create index service_reservations_zone_idx       on public.service_reservations (zone_id);
create index service_reservations_updated_by_idx on public.service_reservations (updated_by);

-- La zona debe ser de la sede del servicio.
create function public.service_reservations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.zone_site_id(new.zone_id) is distinct from public.event_site_id(new.event_id) then
    raise exception 'La zona no es de la sede de este servicio' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger service_reservations_guard before insert or update on public.service_reservations for each row execute function public.service_reservations_guard();

-- Guarda los ajustes de un servicio de una sola vez: [{"zone_id": "…", "seats": 12}, …]. Un valor nulo vuelve al predeterminado.
-- Mismas reglas de quién y cuándo que los conteos (can_count_event). Todo o nada.
create function public.save_reservations(p_event uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_zone uuid; v_seats jsonb;
begin
  if not public.can_count_event(p_event) then
    raise exception 'No puedes registrar reservas de este servicio: todavía no es el día, ya pasó el plazo de 24 horas (solo el líder puede corregir) o no tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Las reservas no son válidas' using errcode = 'check_violation'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_zone := public.safe_uuid(r ->> 'zone_id');
    v_seats := r -> 'seats';
    if v_zone is null then raise exception 'Las reservas no son válidas' using errcode = 'check_violation'; end if;
    if public.zone_site_id(v_zone) is distinct from public.event_site_id(p_event) then
      raise exception 'La zona no es de la sede de este servicio' using errcode = 'check_violation';
    end if;
    if v_seats is null or jsonb_typeof(v_seats) = 'null' then
      delete from public.service_reservations where event_id = p_event and zone_id = v_zone;
    else
      if jsonb_typeof(v_seats) <> 'number' or v_seats::text !~ '^[0-9]{1,5}$' or (v_seats::text)::int > 10000 then
        raise exception 'Los puestos reservados deben ser un número entero entre 0 y 10000' using errcode = 'check_violation';
      end if;
      insert into public.service_reservations (event_id, zone_id, seats) values (p_event, v_zone, (v_seats::text)::int)
      on conflict (event_id, zone_id) do update set seats = excluded.seats, updated_by = auth.uid()
        where public.service_reservations.seats is distinct from excluded.seats;
    end if;
  end loop;
end $$;

alter table public.zone_reservation_defaults enable row level security;
alter table public.service_reservations      enable row level security;
revoke all on public.zone_reservation_defaults, public.service_reservations from anon, authenticated;
grant select, insert, update, delete on public.zone_reservation_defaults to authenticated;
grant select on public.service_reservations to authenticated;                    -- se escriben con save_reservations()

-- Predeterminados: los ven quienes sirven ese día en la sede (y quienes la administran); los define quien administra la sede.
create policy zone_reservation_defaults_select on public.zone_reservation_defaults for select to authenticated
  using (public.can_view_count_guide(public.zone_site_id(zone_id), day));
create policy zone_reservation_defaults_write on public.zone_reservation_defaults for all to authenticated
  using (public.can_manage_site(public.zone_site_id(zone_id))) with check (public.can_manage_site(public.zone_site_id(zone_id)));
-- Ajustes de un servicio: quienes planifican ese servicio.
create policy service_reservations_select on public.service_reservations for select to authenticated using (public.can_plan_event(event_id));

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
