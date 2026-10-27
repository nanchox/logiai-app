-- Imágenes en las novedades: hasta 4 por novedad, de máximo 1 MB, en el bucket privado «announcements» (ruta: id-de-la-novedad/archivo).
-- Aditiva: hasta aplicarla, las novedades funcionan igual y simplemente no tienen imágenes.

create table public.announcement_images (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  image_path      text not null unique check (char_length(image_path) <= 300),
  sort            int  not null default 0
);
create index announcement_images_idx on public.announcement_images (announcement_id, sort);

-- Máximo 4 imágenes por novedad
create function public.announcement_images_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.announcement_images where announcement_id = new.announcement_id) >= 4 then
    raise exception 'Máximo 4 imágenes por novedad' using errcode = 'check_violation';
  end if;
  if split_part(new.image_path, '/', 1) <> new.announcement_id::text then
    raise exception 'La imagen debe estar en la carpeta de su novedad' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger announcement_images_limit before insert on public.announcement_images
  for each row execute function public.announcement_images_limit();

alter table public.announcement_images enable row level security;
revoke all on public.announcement_images from anon;

-- Se ven y se administran igual que los enlaces de la novedad
create policy announcement_images_select on public.announcement_images for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));
create policy announcement_images_write on public.announcement_images for all to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id and public.can_manage_announcement(a.site_id, a.group_id)))
  with check (exists (select 1 from public.announcements a where a.id = announcement_id and public.can_manage_announcement(a.site_id, a.group_id)));

-- Storage: bucket privado, 1 MB por archivo
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy announcements_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'announcements' and (
    exists (select 1 from public.announcement_images i where i.image_path = name)
    -- quien administra la novedad también ve sus archivos (así puede borrarlos aunque la fila ya no exista)
    or exists (select 1 from public.announcements a where a.id::text = (storage.foldername(name))[1] and public.can_manage_announcement(a.site_id, a.group_id))));
create policy announcements_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'announcements' and exists (
    select 1 from public.announcements a where a.id::text = (storage.foldername(name))[1] and public.can_manage_announcement(a.site_id, a.group_id)));
create policy announcements_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'announcements' and exists (
    select 1 from public.announcements a where a.id::text = (storage.foldername(name))[1] and public.can_manage_announcement(a.site_id, a.group_id)));

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
