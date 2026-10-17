-- LogiAI · Fase 4 · Anuncios: noticias, cambios y avisos por alcance (iglesia, sede, sede+día, día o grupo), con enlaces

create type public.announcement_category as enum ('anuncio', 'cambio', 'noticia');

create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  body        text not null default '' check (char_length(body) <= 5000),
  category    public.announcement_category not null default 'anuncio',
  -- Alcance: todo nulo = toda la iglesia · site = una sede · site+day = esa sede ese día · day = ese día en todas las sedes
  -- · group = un grupo (la sede se deduce del grupo)
  site_id     uuid references public.sites(id)  on delete cascade,
  day         public.service_day,
  group_id    uuid references public.groups(id) on delete cascade,
  pinned      boolean not null default false,
  starts_at   timestamptz not null default now(),   -- vigente desde
  ends_at     timestamptz,                          -- vigente hasta (nulo = sin fin)
  author_id   uuid references public.profiles(user_id) on delete set null default auth.uid(),
  author_name text,                                 -- quién lo publicó, con su rol de ese momento (el lector no necesita ver su perfil)
  author_role text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (group_id is null or day is null),
  check (ends_at is null or ends_at > starts_at)
);
create index announcements_feed_idx   on public.announcements (pinned desc, starts_at desc);
create index announcements_site_idx   on public.announcements (site_id);
create index announcements_group_idx  on public.announcements (group_id);
create index announcements_author_idx on public.announcements (author_id);

create table public.announcement_links (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  label           text not null check (char_length(btrim(label)) between 1 and 80),
  url             text not null check (url ~* '^https://[^\s]+$' and char_length(url) <= 2000),   -- solo https
  sort            int  not null default 0
);
create index announcement_links_idx on public.announcement_links (announcement_id, sort);

-- ───────────── Permisos ─────────────
create function public.has_profile() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid())
$$;

-- Quién ve un anuncio (sin contar la vigencia).
create function public.can_view_announcement(p_site uuid, p_day public.service_day, p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin_or_head() or case
    when p_group is not null then public.can_view_group(p_group)
    when p_site is null and p_day is null then public.has_profile()                       -- toda la iglesia
    else
      (p_site is not null and public.is_site_leader(p_site))                              -- líder de esa sede
      or (p_site is null and exists (select 1 from public.site_leaders sl where sl.user_id = auth.uid()))
      or exists (                                                                          -- integrante de un grupo que sirve ahí y ese día
        select 1 from public.memberships m
        join public.groups g on g.id = m.group_id
        join public.service_slots s on s.id = g.service_slot_id
        where m.user_id = auth.uid() and (p_site is null or s.site_id = p_site) and (p_day is null or s.day = p_day))
  end
$$;

-- Quién publica, edita o elimina: cabeza/admin cualquiera; líder los de su sede (incluidos sus grupos);
-- coordinador, solo los de su propio grupo.
create function public.can_manage_announcement(p_site uuid, p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin_or_head()
    or (p_site is not null and public.is_site_leader(p_site))
    or (p_group is not null and p_group = public.my_group_id() and public.my_group_role() = 'coordinador')
$$;

-- Antes de guardar: la sede de un anuncio de grupo es la del grupo (así nadie publica en un grupo ajeno declarando otra
-- sede) y el autor se toma de la sesión, con su nombre y rol del momento.
create function public.announcements_prepare() returns trigger
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
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.author_role := old.author_role;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger announcements_prepare before insert or update on public.announcements
  for each row execute function public.announcements_prepare();

alter table public.announcements      enable row level security;
alter table public.announcement_links enable row level security;
revoke all on public.announcements, public.announcement_links from anon;

-- Se ven los vigentes que le corresponden a la persona; quien administra el alcance ve también los programados y vencidos.
create policy announcements_select on public.announcements for select to authenticated
  using (
    public.can_manage_announcement(site_id, group_id)
    or (starts_at <= now() and (ends_at is null or ends_at > now()) and public.can_view_announcement(site_id, day, group_id))
  );
create policy announcements_insert on public.announcements for insert to authenticated
  with check (public.can_manage_announcement(site_id, group_id));
create policy announcements_update on public.announcements for update to authenticated
  using (public.can_manage_announcement(site_id, group_id)) with check (public.can_manage_announcement(site_id, group_id));
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.can_manage_announcement(site_id, group_id));

-- Los enlaces siguen al anuncio: se ven si se ve el anuncio, y los edita quien lo administra.
create policy announcement_links_select on public.announcement_links for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));
create policy announcement_links_write on public.announcement_links for all to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id and public.can_manage_announcement(a.site_id, a.group_id)))
  with check (exists (select 1 from public.announcements a where a.id = announcement_id and public.can_manage_announcement(a.site_id, a.group_id)));

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
