-- LogiAI · Reservas por reunión: las reservas de zona (predeterminadas y del servicio) y las del rol «Reservas» pueden ser de una reunión
-- concreta (1, 3, 5 o 7 pm) o de todas las del día. Lo ya registrado queda como «todas las reuniones». Aditiva.

-- ───────────── Reservas de zona predeterminadas: por día y, opcionalmente, por reunión ─────────────
alter table public.zone_reservation_defaults add column meeting_id uuid references public.slot_meetings(id) on delete cascade;
alter table public.zone_reservation_defaults add column meeting_key uuid generated always as (coalesce(meeting_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
alter table public.zone_reservation_defaults drop constraint zone_reservation_defaults_pkey;
alter table public.zone_reservation_defaults add primary key (zone_id, day, meeting_key);
create index zone_reservation_defaults_meeting_idx on public.zone_reservation_defaults (meeting_id);

-- La reunión debe ser del mismo día y de la misma sede que la zona.
create function public.zone_reservation_defaults_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.meeting_id is not null and not exists (
    select 1 from public.slot_meetings m join public.service_slots s on s.id = m.slot_id
    where m.id = new.meeting_id and s.day = new.day and s.site_id = public.zone_site_id(new.zone_id)) then
    raise exception 'La reunión no es de ese día en la sede de la zona' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger zone_reservation_defaults_guard before insert or update on public.zone_reservation_defaults for each row execute function public.zone_reservation_defaults_guard();

-- ───────────── Ajuste de un servicio: por zona y, opcionalmente, por reunión ─────────────
alter table public.service_reservations add column meeting_id uuid;      -- reunión estándar o del servicio personalizado; nulo = todas
alter table public.service_reservations add column meeting_key uuid generated always as (coalesce(meeting_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;
alter table public.service_reservations drop constraint service_reservations_pkey;
alter table public.service_reservations add primary key (event_id, zone_id, meeting_key);

-- [{"zone_id": "…", "meeting_id": "…" (opcional: sin ella, todas las reuniones), "seats": 12}, …]. Un valor nulo vuelve al predeterminado.
create or replace function public.save_reservations(p_event uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare r jsonb; v_zone uuid; v_meet uuid; v_seats jsonb;
begin
  if not public.can_count_event(p_event) then
    raise exception 'No puedes registrar reservas de este servicio: todavía no es el día, ya pasó el plazo de 24 horas (solo el líder puede corregir) o no tienes permiso' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Las reservas no son válidas' using errcode = 'check_violation'; end if;
  for r in select * from jsonb_array_elements(p_items) loop
    v_zone := public.safe_uuid(r ->> 'zone_id');
    v_seats := r -> 'seats';
    v_meet := public.safe_uuid(r ->> 'meeting_id');
    if v_zone is null or (r ? 'meeting_id' and jsonb_typeof(r -> 'meeting_id') <> 'null' and v_meet is null) then
      raise exception 'Las reservas no son válidas' using errcode = 'check_violation';
    end if;
    if public.zone_site_id(v_zone) is distinct from public.event_site_id(p_event) then
      raise exception 'La zona no es de la sede de este servicio' using errcode = 'check_violation';
    end if;
    if v_meet is not null and not public.is_event_meeting(p_event, v_meet) then
      raise exception 'La reunión no es de este servicio' using errcode = 'check_violation';
    end if;
    if v_seats is null or jsonb_typeof(v_seats) = 'null' then
      delete from public.service_reservations where event_id = p_event and zone_id = v_zone and meeting_key = coalesce(v_meet, '00000000-0000-0000-0000-000000000000'::uuid);
    else
      if jsonb_typeof(v_seats) <> 'number' or v_seats::text !~ '^[0-9]{1,5}$' or (v_seats::text)::int > 10000 then
        raise exception 'Los puestos reservados deben ser un número entero entre 0 y 10000' using errcode = 'check_violation';
      end if;
      insert into public.service_reservations (event_id, zone_id, meeting_id, seats) values (p_event, v_zone, v_meet, (v_seats::text)::int)
      on conflict (event_id, zone_id, meeting_key) do update set seats = excluded.seats, updated_by = auth.uid()
        where public.service_reservations.seats is distinct from excluded.seats;
    end if;
  end loop;
end $$;

-- ───────────── Reservas del rol «Reservas»: de una reunión (por hora) o de todas ─────────────
alter table public.seat_reservations add column meeting_time time;      -- nulo = todas las reuniones del día

drop function public.create_seat_reservation(uuid, date, text, int, text);
create function public.create_seat_reservation(p_zone uuid, p_date date, p_row text, p_seats int, p_for text, p_meeting time default null) returns uuid
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
  insert into public.seat_reservations (site_id, zone_id, service_date, row_label, seats, for_whom, created_by, meeting_time)
  values (v_site, p_zone, p_date, v_row, p_seats, v_for, auth.uid(), p_meeting) returning id into v_id;
  return v_id;
end $$;

drop function public.update_seat_reservation(uuid, uuid, date, text, int, text);
create function public.update_seat_reservation(p_id uuid, p_zone uuid, p_date date, p_row text, p_seats int, p_for text, p_meeting time default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.seat_reservations; v_row text := btrim(coalesce(p_row, '')); v_for text := btrim(coalesce(p_for, ''));
begin
  select * into r from public.seat_reservations s where s.id = p_id;
  if not found or not public.can_manage_site(r.site_id) then
    raise exception 'No tienes permiso para editar esta reserva' using errcode = 'insufficient_privilege';
  end if;
  if public.zone_site_id(p_zone) is distinct from r.site_id then
    raise exception 'La zona debe ser de la misma sede de la reserva' using errcode = 'check_violation';
  end if;
  if p_date is null or (p_date is distinct from r.service_date and (p_date < public.today_co() or p_date > public.today_co() + 120)) then
    raise exception 'La fecha debe ser de hoy en adelante (hasta 120 días)' using errcode = 'check_violation';
  end if;
  if char_length(v_row) not between 1 and 20 then raise exception 'Escribe la fila (máximo 20 caracteres)' using errcode = 'check_violation'; end if;
  if p_seats is null or p_seats not between 1 and 10000 then raise exception 'Los puestos deben ser un número entero de 1 a 10000' using errcode = 'check_violation'; end if;
  if char_length(v_for) not between 1 and 120 then raise exception 'Escribe para quién es la reserva (máximo 120 caracteres)' using errcode = 'check_violation'; end if;
  update public.seat_reservations
     set zone_id = p_zone, service_date = p_date, row_label = v_row, seats = p_seats, for_whom = v_for, meeting_time = p_meeting
   where id = p_id;
end $$;

drop function public.seat_reservations_for(date, date);
create function public.seat_reservations_for(p_from date, p_until date)
returns table (id uuid, site_id uuid, site_name text, zone_id uuid, zone_name text, location_id uuid, location_name text, service_date date, meeting_time time,
               row_label text, seats int, for_whom text, created_by_name text, mine boolean)
language sql stable security definer set search_path = '' as $$
  select r.id, r.site_id, s.name, z.id, z.name, l.id, l.name, r.service_date, r.meeting_time, r.row_label, r.seats, r.for_whom, p.full_name, r.created_by is not distinct from auth.uid()
  from public.seat_reservations r
  join public.sites s on s.id = r.site_id
  join public.zones z on z.id = r.zone_id
  join public.locations l on l.id = z.location_id
  left join public.profiles p on p.user_id = r.created_by
  where r.service_date between p_from and p_until
    and (r.created_by is not distinct from auth.uid() or public.can_view_seat_reservations(r.site_id))
  order by r.service_date, r.meeting_time nulls first, s.sort, l.sort, l.name, z.sort, z.name, r.row_label, r.created_at
$$;

-- Reuniones estándar de las sedes donde la persona reserva (quien solo reserva no lee los horarios): para elegir la reunión.
create function public.reserver_meetings()
returns table (site_id uuid, day public.service_day, start_time time, label text)
language sql stable security definer set search_path = '' as $$
  select s.site_id, s.day, m.start_time, m.label
  from public.slot_meetings m join public.service_slots s on s.id = m.slot_id
  where public.is_site_reserver(s.site_id) or public.can_manage_site(s.site_id)
  order by s.site_id, s.day, m.start_time
$$;

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
