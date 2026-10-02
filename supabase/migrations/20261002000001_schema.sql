-- LogiAI · Fase 1 · Esquema base: organización (sedes, grupos, usuarios) y manual (mapas, zonas, posiciones)

-- ───────────── Tipos ─────────────
create type public.service_day    as enum ('miercoles', 'sabado', 'domingo');
create type public.service_shift  as enum ('am', 'pm', 'unica');
create type public.group_role     as enum ('coordinador', 'supervisor', 'voluntario');
create type public.location_kind  as enum ('auditorio', 'teatro', 'overflow', 'salon', 'exterior', 'otro');
create type public.zone_kind      as enum ('orientacion', 'acomodacion', 'otro');   -- orientación = exterior, acomodación = interior
create type public.position_kind  as enum ('supervisor', 'voluntario');
create type public.marker_variant as enum ('desktop', 'mobile');

-- ───────────── Organización ─────────────
create table public.sites (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name       text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Un horario de servicio concreto de una sede: día + franja. Un grupo pertenece a uno solo.
create table public.service_slots (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites(id) on delete cascade,
  day          public.service_day   not null,
  shift        public.service_shift not null default 'unica',
  arrival_time time,
  start_time   time,
  end_time     time,
  unique (site_id, day, shift)
);

create table public.groups (
  id              uuid primary key default gen_random_uuid(),
  service_slot_id uuid not null references public.service_slots(id) on delete cascade,
  name            text not null,
  created_at      timestamptz not null default now(),
  unique (service_slot_id, name)
);

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique check (email = lower(email)),
  full_name  text,
  avatar_url text,
  is_admin   boolean not null default false,   -- desarrollador / administrador del sistema
  is_head    boolean not null default false,   -- cabeza de ministerio
  created_at timestamptz not null default now()
);

-- Líder de sede: auditor que acompaña a los grupos de la sede. No pertenece a ningún grupo.
create table public.site_leaders (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  primary key (user_id, site_id)
);

-- La clave primaria en user_id garantiza "una persona, un solo grupo".
create table public.memberships (
  user_id    uuid primary key references public.profiles(user_id) on delete cascade,
  group_id   uuid not null references public.groups(id) on delete cascade,
  role       public.group_role not null,
  created_at timestamptz not null default now()
);
create index memberships_group_idx on public.memberships (group_id);

-- Lista blanca de acceso. Quien no tenga una invitación no puede crear cuenta.
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique check (email = lower(email)),
  is_admin        boolean not null default false,
  is_head         boolean not null default false,
  leader_site_ids uuid[]  not null default '{}',
  group_id        uuid references public.groups(id) on delete cascade,
  group_role      public.group_role,
  invited_by      uuid references public.profiles(user_id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  check ((group_id is null) = (group_role is null)),
  check (group_id is null or (not is_admin and not is_head and cardinality(leader_site_ids) = 0))
);

-- ───────────── Manual ─────────────
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references public.sites(id) on delete cascade,
  kind       public.location_kind not null default 'otro',
  name       text not null,
  sort       int  not null default 0,
  manual_url text,
  unique (site_id, name)
);

create table public.zones (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name        text not null,
  kind        public.zone_kind not null default 'acomodacion',
  sort        int  not null default 0,
  unique (location_id, name),
  unique (id, location_id)
);

-- Imagen de mapa: una general por location (zone_id nulo) y una por zona.
create table public.maps (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  zone_id       uuid,
  name          text not null,
  image_path    text not null,                 -- ruta en el bucket "maps"
  image_version int  not null default 1,
  sort          int  not null default 0,
  updated_at    timestamptz not null default now(),
  foreign key (zone_id, location_id) references public.zones(id, location_id) on delete cascade
);
create unique index maps_one_per_target on public.maps (location_id, coalesce(zone_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.positions (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  zone_id     uuid,                            -- nulo para posiciones que cubren varias zonas (p. ej. supervisores)
  code        text not null,
  name        text not null,
  kind        public.position_kind not null,
  description text not null default '',
  uses_radio  boolean not null default false,
  days        public.service_day[]   not null default '{}',   -- vacío = aplica todos los días
  shifts      public.service_shift[] not null default '{}',   -- vacío = aplica todas las franjas
  is_active   boolean not null default true,
  sort        int not null default 0,
  unique (location_id, code),
  foreign key (zone_id, location_id) references public.zones(id, location_id) on delete set null (zone_id)
);

-- Dónde se dibuja una posición en un mapa (porcentajes). Un pin puede tener variante móvil.
create table public.position_markers (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete cascade,
  map_id      uuid not null references public.maps(id) on delete cascade,
  variant     public.marker_variant not null default 'desktop',
  top_pct     numeric(5,2) not null check (top_pct  between 0 and 100),
  left_pct    numeric(5,2) not null check (left_pct between 0 and 100),
  unique (position_id, map_id, variant)
);
create index position_markers_map_idx on public.position_markers (map_id);
