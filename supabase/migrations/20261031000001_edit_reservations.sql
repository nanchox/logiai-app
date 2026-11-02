-- LogiAI · Reservas de puestos: quien administra la sede (líder de su sede, cabeza y administrador) también las edita.
-- Aditiva.

-- Cambia una reserva de su sede: zona (de la misma sede), fecha, fila, puestos y para quién. La fecha solo se valida si cambia
-- (así se puede corregir una reserva de un día que ya pasó sin moverla).
create function public.update_seat_reservation(p_id uuid, p_zone uuid, p_date date, p_row text, p_seats int, p_for text) returns void
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
     set zone_id = p_zone, service_date = p_date, row_label = v_row, seats = p_seats, for_whom = v_for
   where id = p_id;
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
-- Las funciones del servidor (avisos) siguen sin poder ejecutarlas ninguna persona, ni siquiera con sesión.
revoke execute on function public.support_request_audience(uuid), public.pending_counts_audience(), public.claim_notification(uuid, text, uuid, boolean) from authenticated;
