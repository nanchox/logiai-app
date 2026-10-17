-- LogiAI · Alta de horarios, grupos y personas con SQL (provisional, hasta que exista la pantalla de Usuarios y grupos)
-- Pégalo en Supabase → SQL Editor, cambia los valores y ejecútalo por bloques. Es seguro repetir un bloque:
-- los horarios, grupos y correos repetidos se ignoran.

-- ───────── 1. Horario de servicio de una sede (día + franja) ─────────
-- día: 'miercoles' | 'sabado' | 'domingo'     franja: 'am' | 'pm' | 'unica'
insert into public.service_slots (site_id, day, shift, arrival_time, start_time, end_time)
select id, 'sabado', 'pm', '16:00', '17:00', '19:30' from public.sites where slug = 'castellana'
on conflict (site_id, day, shift) do nothing;

-- ───────── 2. Grupos de ese horario ─────────
insert into public.groups (service_slot_id, name)
select sl.id, g
from public.service_slots sl
join public.sites s on s.id = sl.site_id
cross join unnest(array['Grupo 1', 'Grupo 2', 'Grupo 3', 'Grupo 4']) as g
where s.slug = 'castellana' and sl.day = 'sabado' and sl.shift = 'pm'
on conflict (service_slot_id, name) do nothing;

-- ───────── 3. Invitar personas a un grupo ─────────
-- rol: 'coordinador' (máx. 2 por grupo) | 'supervisor' | 'voluntario'. Cada persona, en UN solo grupo.
-- Quien tenga una invitación puede entrar con ese correo de Google; al entrar queda en su grupo automáticamente.
insert into public.invitations (email, group_id, group_role)
select lower(trim(e)), g.id, 'voluntario'::public.group_role
from unnest(array[
  'ana@gmail.com',
  'luis@gmail.com'
]) as e
cross join (
  select g.id from public.groups g
  join public.service_slots sl on sl.id = g.service_slot_id
  join public.sites s on s.id = sl.site_id
  where s.slug = 'castellana' and sl.day = 'sabado' and sl.shift = 'pm' and g.name = 'Grupo 1'
) as g
on conflict (email) do nothing;

-- ───────── 4. Invitar a un líder de sede (no pertenece a ningún grupo) ─────────
insert into public.invitations (email, leader_site_ids)
select 'lider@gmail.com', array[id] from public.sites where slug = 'castellana'
on conflict (email) do nothing;

-- ───────── Revisar ─────────
-- Invitaciones pendientes:   select email, group_role, accepted_at from public.invitations order by created_at desc;
-- Personas por grupo:        select g.name, m.role, p.full_name, p.email from public.memberships m
--                            join public.profiles p on p.user_id = m.user_id join public.groups g on g.id = m.group_id order by 1, 2;
-- Mover a alguien de grupo:  update public.memberships set group_id = '<id del grupo>' where user_id = '<id>';
-- Una invitación solo sirve para correos que AÚN NO han entrado. Para cambiar el rol o grupo de quien ya
-- entró, edita su fila en public.memberships.
