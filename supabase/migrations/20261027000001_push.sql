-- LogiAI · Fase 9 · Avisos al teléfono (notificaciones push): dispositivos, preferencias y a quién avisar
-- Las notificaciones solo avisan («piden apoyo», «faltan los conteos»): no llevan nombres ni datos personales.

-- ───────────── Dispositivos que activaron los avisos ─────────────
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh     text not null check (char_length(p256dh) between 1 and 200),
  auth       text not null check (char_length(auth) between 1 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Qué avisos quiere cada persona (sin fila: todos, mientras tenga un dispositivo activado).
create table public.notification_prefs (
  user_id          uuid primary key references public.profiles(user_id) on delete cascade,
  support_requests boolean not null default true,
  pending_counts   boolean not null default true
);

-- Para no repetir un aviso a la misma persona (solo lo usa el servidor).
create table public.notification_log (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind    text not null,
  ref_id  uuid not null,
  sent_on date not null,
  primary key (user_id, kind, ref_id, sent_on)
);

-- ───────────── Funciones ─────────────
-- Registra (o toma para quien llama) el dispositivo: si el mismo navegador lo usa otra persona, el aviso pasa a ella. Máximo 10 por persona.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia sesión para continuar' using errcode = 'insufficient_privilege'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  delete from public.push_subscriptions s
   where s.user_id = auth.uid()
     and s.id in (select x.id from public.push_subscriptions x where x.user_id = auth.uid() order by x.created_at desc offset 10);
end $$;

create function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- ── Solo el servidor (service_role): a quién se avisa ──
-- Personas que pueden atender una solicitud de apoyo abierta, con algún dispositivo y sin haber desactivado ese aviso.
create function public.support_request_audience(p_request uuid)
returns table (user_id uuid, group_name text, service_date date, needed int, filled int, site_name text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, g.name, e.service_date, r.needed, public.support_filled(r.id), si.name
  from public.support_requests r
  join public.service_events e on e.id = r.event_id
  join public.service_slots sl on sl.id = e.slot_id
  join public.sites si on si.id = sl.site_id
  join public.groups g on g.id = e.group_id
  join public.memberships m on m.role in ('voluntario', 'supervisor')
  where r.id = p_request and public.request_is_open(r.id)
    and public.can_support_event(m.user_id, r.event_id)
    and coalesce((select np.support_requests from public.notification_prefs np where np.user_id = m.user_id), true)
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = m.user_id)
$$;

-- Coordinadores y supervisores a quienes les falta registrar los conteos de un servicio de hoy o de ayer (aún dentro de su plazo).
create function public.pending_counts_audience()
returns table (user_id uuid, event_id uuid, service_date date, site_name text, day public.service_day, shift public.service_shift, group_name text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, e.id, e.service_date, si.name, sl.day, sl.shift, g.name
  from public.service_events e
  join public.service_slots sl on sl.id = e.slot_id
  join public.sites si on si.id = sl.site_id
  join public.groups g on g.id = e.group_id
  join public.memberships m on m.group_id = e.group_id and m.role in ('coordinador', 'supervisor')
  where e.status = 'programado' and e.service_date between public.today_co() - 1 and public.today_co()
    and not exists (select 1 from public.service_counts c where c.event_id = e.id)
    and exists (select 1 from public.locations l where l.site_id = sl.site_id and l.capacity is not null)
    and coalesce((select np.pending_counts from public.notification_prefs np where np.user_id = m.user_id), true)
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = m.user_id)
$$;

-- Marca un aviso como enviado; devuelve false si ya se había enviado (así no se repite).
create function public.claim_notification(p_user uuid, p_kind text, p_ref uuid, p_daily boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.notification_log (user_id, kind, ref_id, sent_on)
  values (p_user, p_kind, p_ref, case when p_daily then public.today_co() else date '2000-01-01' end)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- ───────────── RLS ─────────────
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log   enable row level security;
revoke all on public.push_subscriptions, public.notification_prefs, public.notification_log from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;                    -- se registran con save_push_subscription()
grant select, insert, update on public.notification_prefs to authenticated;

create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
create policy notification_prefs_select on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy notification_prefs_insert on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy notification_prefs_update on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

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
-- Las tres funciones del servidor no las ejecuta ninguna persona, ni siquiera con sesión.
revoke execute on function public.support_request_audience(uuid), public.pending_counts_audience(), public.claim_notification(uuid, text, uuid, boolean) from authenticated;
