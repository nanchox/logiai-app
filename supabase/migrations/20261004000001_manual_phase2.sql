-- LogiAI · Fase 2 · Manual: fotos y videos por posición, flujos de ubicación y bucket de fotos

create type public.media_kind as enum ('foto', 'youtube', 'link');

-- ───────────── Medios de una posición ─────────────
create table public.position_media (
  id           uuid primary key default gen_random_uuid(),
  position_id  uuid not null references public.positions(id) on delete cascade,
  kind         public.media_kind not null,
  url          text,            -- youtube / link
  storage_path text,            -- foto, en el bucket "position-media"
  caption      text,
  sort         int not null default 0,
  created_at   timestamptz not null default now(),
  check ((kind = 'foto' and storage_path is not null and url is null)
      or (kind <> 'foto' and url is not null and storage_path is null)),
  -- solo enlaces https; los de YouTube, solo de youtube.com / youtu.be
  check (url is null or url ~* '^https://[^\s]+$'),
  check (kind <> 'youtube' or url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/')
);
create index position_media_position_idx on public.position_media (position_id, sort);

-- ───────────── Flujos de ubicación ─────────────
-- Por sede: qué hacer cuando se llena el auditorio principal (a dónde enviar a la gente, en qué orden).
create table public.flows (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites(id) on delete cascade,
  name        text not null,
  description text not null default '',
  sort        int  not null default 0,
  unique (site_id, name)
);

create table public.flow_steps (
  id           uuid primary key default gen_random_uuid(),
  flow_id      uuid not null references public.flows(id) on delete cascade,
  step_order   int  not null,
  location_id  uuid references public.locations(id) on delete set null,
  title        text not null,
  instructions text not null default '',
  unique (flow_id, step_order) deferrable initially deferred   -- permite reordenar en una sola operación
);

create function public.flow_site_id(p_flow uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select f.site_id from public.flows f where f.id = p_flow
$$;

-- El espacio de un paso debe ser de la misma sede que el flujo.
create function public.flow_steps_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.location_id is not null
     and public.location_site_id(new.location_id) is distinct from public.flow_site_id(new.flow_id) then
    raise exception 'El espacio del paso debe pertenecer a la misma sede que el flujo' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger flow_steps_guard before insert or update on public.flow_steps
  for each row execute function public.flow_steps_guard();

-- Al reemplazar un mapa se actualiza su fecha.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger maps_touch before update on public.maps for each row execute function public.touch_updated_at();

-- ───────────── RLS ─────────────
alter table public.position_media enable row level security;
alter table public.flows          enable row level security;
alter table public.flow_steps     enable row level security;

create policy media_select on public.position_media for select to authenticated
  using (public.can_view_site(public.position_site_id(position_id)));
create policy media_write  on public.position_media for all to authenticated
  using (public.can_manage_site(public.position_site_id(position_id)))
  with check (public.can_manage_site(public.position_site_id(position_id)));

create policy flows_select on public.flows for select to authenticated using (public.can_view_site(site_id));
create policy flows_write  on public.flows for all to authenticated
  using (public.can_manage_site(site_id)) with check (public.can_manage_site(site_id));

create policy flow_steps_select on public.flow_steps for select to authenticated
  using (public.can_view_site(public.flow_site_id(flow_id)));
create policy flow_steps_write  on public.flow_steps for all to authenticated
  using (public.can_manage_site(public.flow_site_id(flow_id)))
  with check (public.can_manage_site(public.flow_site_id(flow_id)));

-- ───────────── Storage: fotos de posiciones (privado; 1.ª carpeta = slug de la sede) ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('position-media', 'position-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy media_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'position-media' and public.can_view_site(public.site_id_by_slug((storage.foldername(name))[1])));
create policy media_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'position-media' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
create policy media_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'position-media' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])))
  with check (bucket_id = 'position-media' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
create policy media_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'position-media' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
