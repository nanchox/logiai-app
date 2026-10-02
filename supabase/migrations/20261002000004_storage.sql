-- LogiAI · Fase 1 · Storage de mapas (bucket privado; la primera carpeta de la ruta es el slug de la sede)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maps', 'maps', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy maps_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'maps' and public.can_view_site(public.site_id_by_slug((storage.foldername(name))[1])));

create policy maps_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'maps' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));

create policy maps_objects_update on storage.objects for update to authenticated
  using (bucket_id = 'maps' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])))
  with check (bucket_id = 'maps' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));

create policy maps_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'maps' and public.can_manage_site(public.site_id_by_slug((storage.foldername(name))[1])));
