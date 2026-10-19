-- LogiAI · Fase 6 · Asistente (chat IA): búsqueda en lo cargado y límite diario por persona

-- ───────────── Límite diario de mensajes ─────────────
-- Los modelos gratuitos tienen cupo: cada persona tiene un máximo de preguntas por día (hora de Colombia).
create table public.chat_usage (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  day     date not null,
  n       int  not null default 0,
  primary key (user_id, day)
);
alter table public.chat_usage enable row level security;
revoke all on public.chat_usage from anon, authenticated;   -- solo se toca a través de chat_consume()

-- Cuenta una pregunta de quien llama. allowed = false cuando ya alcanzó el límite (y no la cuenta).
create function public.chat_consume(p_limit int default 30) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_limit int := least(greatest(coalesce(p_limit, 30), 1), 500); v_n int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para usar el asistente' using errcode = 'insufficient_privilege'; end if;
  insert into public.chat_usage as u (user_id, day, n) values (auth.uid(), public.today_co(), 1)
  on conflict (user_id, day) do update set n = u.n + 1 where u.n < v_limit
  returning u.n into v_n;
  if v_n is null then
    select u.n into v_n from public.chat_usage u where u.user_id = auth.uid() and u.day = public.today_co();
    return jsonb_build_object('allowed', false, 'used', v_n, 'limit', v_limit);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_n, 'limit', v_limit);
end $$;

-- ───────────── Búsqueda ─────────────
-- Convierte una pregunta en una consulta de texto completo en español: cada palabra (de 3 letras o más) suma, no todas son obligatorias.
create function public.chat_tsquery(p_text text) returns tsquery
language sql immutable set search_path = '' as $$
  select to_tsquery('spanish', string_agg(w, ' | '))
  from (
    select distinct regexp_replace(lower(x), '[^a-záéíóúüñ0-9]', '', 'g') as w
    from unnest(regexp_split_to_array(left(coalesce(p_text, ''), 500), '\s+')) as x
  ) q
  where char_length(w) >= 3
$$;

-- Busca en posiciones, flujos y novedades vigentes. Corre con los permisos de quien llama (SECURITY INVOKER):
-- las políticas RLS de cada tabla deciden qué puede aparecer, igual que en las pantallas.
create function public.search_manual(p_query text, p_limit int default 8)
returns table (kind text, id uuid, site_slug text, location_id uuid, title text, body text, rank real)
language sql stable set search_path = '' as $$
  with q as (select public.chat_tsquery(p_query) as tsq),
  docs as (
    select 'posicion'::text as kind, p.id, s.slug as site_slug, l.id as location_id,
           p.code || ' · ' || p.name || ' (' || l.name || ', ' || s.name || ')' as title,
           concat_ws('. ',
             nullif(p.description, ''),
             case when z.name is not null then 'Zona: ' || z.name end,
             case when p.uses_radio then 'Usa radio' end,
             case when p.kind = 'supervisor' then 'Posición de supervisor' end,
             case when cardinality(p.days) > 0 then 'Aplica los días: ' || array_to_string(p.days, ', ') end,
             case when cardinality(p.shifts) > 0 then 'Franjas: ' || array_to_string(p.shifts, ', ') end) as body
    from public.positions p
    join public.locations l on l.id = p.location_id
    join public.sites s on s.id = l.site_id
    left join public.zones z on z.id = p.zone_id
    where p.is_active
    union all
    select 'flujo', f.id, s.slug, null::uuid,
           f.name || ' (' || s.name || ')',
           concat_ws(E'\n', nullif(f.description, ''),
             (select string_agg(st.step_order || '. ' || st.title || case when st.instructions <> '' then ': ' || st.instructions else '' end, E'\n' order by st.step_order)
                from public.flow_steps st where st.flow_id = f.id))
    from public.flows f join public.sites s on s.id = f.site_id
    union all
    select 'novedad', a.id, null, null::uuid, a.title, a.body
    from public.announcements a
    where a.starts_at <= now() and (a.ends_at is null or a.ends_at > now())
  )
  select d.kind, d.id, d.site_slug, d.location_id, d.title, left(d.body, 1500),
         ts_rank_cd(to_tsvector('spanish', d.title || ' ' || d.body), q.tsq)::real as rank
  from docs d, q
  where q.tsq is not null and to_tsvector('spanish', d.title || ' ' || d.body) @@ q.tsq
  order by rank desc, d.title
  limit least(greatest(coalesce(p_limit, 8), 1), 12)
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
