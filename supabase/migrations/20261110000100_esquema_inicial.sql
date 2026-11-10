-- =====================================================================
-- RedDeportivaTV · Migración 1: esquema inicial
-- ---------------------------------------------------------------------
-- Crea: campeonatos, categorías, partidos, noticias, álbumes, fotos,
--       transmisiones manuales y la lista de administradores.
-- Seguridad:
--   * RLS activado en todas las tablas.
--   * Visitantes (rol "anon"): SOLO lectura de lo publicado/visible.
--   * Administradores: los usuarios registrados en public.administradores
--     (máximo 2). Ningún otro usuario puede modificar nada.
--   * Como "Automatically expose new tables" está desactivado, los
--     permisos de la API (GRANT) se dan explícitamente acá.
--   * Bucket "fotos": lectura pública por URL, subida solo de admins,
--     solo JPG/PNG/WebP y hasta 5 MB por archivo.
--
-- Se ejecuta todo dentro de una transacción: si algo falla, no se
-- aplica nada. No contiene claves, contraseñas ni correos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Esquema privado para funciones internas (no expuesto por la API)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 1. Administradores
-- ---------------------------------------------------------------------
create table public.administradores (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null check (char_length(nombre) between 1 and 80),
  creado_en  timestamptz not null default now()
);
comment on table public.administradores is
  'Usuarios con permiso para administrar contenido. Máximo 2. Se cargan solo desde el editor SQL.';

-- Máximo dos administradores
create function private.limitar_administradores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.administradores) >= 2 then
    raise exception 'RedDeportivaTV admite como máximo 2 administradores';
  end if;
  return new;
end;
$$;

create trigger limitar_administradores
  before insert on public.administradores
  for each row execute function private.limitar_administradores();

-- ¿El usuario que hace la consulta es administrador?
-- SECURITY DEFINER: puede leer la tabla aunque el que consulta no.
create function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a where a.user_id = auth.uid()
  );
$$;
revoke all on function private.es_admin() from public;
grant execute on function private.es_admin() to anon, authenticated, service_role;

-- Actualiza la columna actualizado_en en cada cambio
create function private.tocar_actualizado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Al publicar por primera vez, guarda la fecha de publicación
create function private.marcar_publicacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'publicada' and new.publicado_en is null then
    new.publicado_en := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Campeonatos y categorías
-- ---------------------------------------------------------------------
create table public.campeonatos (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(nombre) between 1 and 120),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  descripcion    text check (char_length(descripcion) <= 500),
  temporada      text check (char_length(temporada) <= 20),
  visible        boolean not null default true,
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.categorias (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(nombre) between 1 and 80),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  visible        boolean not null default true,
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Partidos
-- ---------------------------------------------------------------------
create table public.partidos (
  id              uuid primary key default gen_random_uuid(),
  campeonato_id   uuid not null references public.campeonatos (id) on delete restrict,
  categoria_id    uuid references public.categorias (id) on delete restrict,
  equipo_local    text not null check (char_length(equipo_local) between 1 and 80),
  equipo_visitante text not null check (char_length(equipo_visitante) between 1 and 80),
  fecha           date,
  hora            time,
  lugar           text check (char_length(lugar) <= 120),
  fase            text check (char_length(fase) <= 60),
  goles_local     smallint check (goles_local between 0 and 99),
  goles_visitante smallint check (goles_visitante between 0 and 99),
  visible         boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index partidos_campeonato_idx on public.partidos (campeonato_id);
create index partidos_categoria_idx  on public.partidos (categoria_id);
create index partidos_fecha_idx      on public.partidos (fecha desc);

-- ---------------------------------------------------------------------
-- 4. Noticias
-- ---------------------------------------------------------------------
create table public.noticias (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  titulo         text not null check (char_length(titulo) between 1 and 160),
  descripcion    text check (char_length(descripcion) <= 300),
  contenido      text check (char_length(contenido) <= 50000),
  portada_path   text check (char_length(portada_path) <= 300),
  portada_alt    text check (char_length(portada_alt) <= 200),
  campeonato_id  uuid references public.campeonatos (id) on delete restrict,
  categoria_id   uuid references public.categorias (id) on delete restrict,
  partido_id     uuid references public.partidos (id) on delete restrict,
  estado         text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicado_en   timestamptz,
  creado_por     uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index noticias_publicadas_idx on public.noticias (estado, publicado_en desc);
create index noticias_campeonato_idx on public.noticias (campeonato_id);
create index noticias_categoria_idx  on public.noticias (categoria_id);
create index noticias_partido_idx    on public.noticias (partido_id);

-- ---------------------------------------------------------------------
-- 5. Álbumes y fotos
-- ---------------------------------------------------------------------
create table public.albumes (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  titulo         text not null check (char_length(titulo) between 1 and 160),
  descripcion    text check (char_length(descripcion) <= 300),
  fecha          date,
  portada_path   text check (char_length(portada_path) <= 300),
  portada_alt    text check (char_length(portada_alt) <= 200),
  campeonato_id  uuid references public.campeonatos (id) on delete restrict,
  categoria_id   uuid references public.categorias (id) on delete restrict,
  partido_id     uuid references public.partidos (id) on delete restrict,
  estado         text not null default 'borrador' check (estado in ('borrador', 'publicada')),
  publicado_en   timestamptz,
  creado_por     uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index albumes_publicados_idx on public.albumes (estado, publicado_en desc);
create index albumes_campeonato_idx on public.albumes (campeonato_id);
create index albumes_categoria_idx  on public.albumes (categoria_id);
create index albumes_partido_idx    on public.albumes (partido_id);
create index albumes_fecha_idx      on public.albumes (fecha desc);

create table public.fotos (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albumes (id) on delete cascade,
  path        text not null unique check (char_length(path) <= 300),
  mini_path   text check (char_length(mini_path) <= 300),
  ancho       integer check (ancho between 1 and 10000),
  alto        integer check (alto between 1 and 10000),
  peso_bytes  integer check (peso_bytes between 1 and 5242880),
  alt         text check (char_length(alt) <= 200),
  descripcion text check (char_length(descripcion) <= 200),
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);
create index fotos_album_idx on public.fotos (album_id, orden);

-- ---------------------------------------------------------------------
-- 6. Transmisiones manuales (sin API de YouTube)
-- ---------------------------------------------------------------------
create table public.transmisiones (
  id             uuid primary key default gen_random_uuid(),
  titulo         text not null check (char_length(titulo) between 1 and 160),
  youtube_url    text not null check (
                   char_length(youtube_url) <= 300 and
                   youtube_url ~ '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'
                 ),
  en_vivo        boolean not null default false,
  termina_en     timestamptz,
  partido_id     uuid references public.partidos (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index transmisiones_vivo_idx on public.transmisiones (en_vivo, actualizado_en desc);

-- ---------------------------------------------------------------------
-- 7. Disparadores (fechas automáticas)
-- ---------------------------------------------------------------------
create trigger tocar_actualizado before update on public.campeonatos   for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.categorias    for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.partidos      for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.noticias      for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.albumes       for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.transmisiones for each row execute function private.tocar_actualizado();

create trigger marcar_publicacion before insert or update on public.noticias for each row execute function private.marcar_publicacion();
create trigger marcar_publicacion before insert or update on public.albumes  for each row execute function private.marcar_publicacion();

-- ---------------------------------------------------------------------
-- 8. Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table public.administradores enable row level security;
alter table public.campeonatos     enable row level security;
alter table public.categorias      enable row level security;
alter table public.partidos        enable row level security;
alter table public.noticias        enable row level security;
alter table public.albumes         enable row level security;
alter table public.fotos           enable row level security;
alter table public.transmisiones   enable row level security;

-- Administradores: cada admin solo puede ver su propia fila (para que el
-- panel sepa si tiene permiso). Nadie puede agregar/quitar admins por API.
create policy "Admin ve su propia fila" on public.administradores
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Campeonatos / categorías / partidos: visitantes ven lo visible
create policy "Visitantes leen campeonatos visibles" on public.campeonatos
  for select to anon, authenticated using (visible);
create policy "Visitantes leen categorias visibles" on public.categorias
  for select to anon, authenticated using (visible);
create policy "Visitantes leen partidos visibles" on public.partidos
  for select to anon, authenticated using (visible);

-- Noticias / álbumes: visitantes ven solo lo publicado
create policy "Visitantes leen noticias publicadas" on public.noticias
  for select to anon, authenticated using (estado = 'publicada');
create policy "Visitantes leen albumes publicados" on public.albumes
  for select to anon, authenticated using (estado = 'publicada');

-- Fotos: visibles solo si su álbum está publicado.
-- Se usa una función SECURITY DEFINER porque los visitantes no tienen
-- permiso sobre la columna albumes.estado (ver GRANT por columnas).
create function private.album_publicado(p_album uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.albumes a where a.id = p_album and a.estado = 'publicada'
  );
$$;
revoke all on function private.album_publicado(uuid) from public;
grant execute on function private.album_publicado(uuid) to anon, authenticated, service_role;

create policy "Visitantes leen fotos de albumes publicados" on public.fotos
  for select to anon, authenticated
  using (private.album_publicado(album_id));

-- Transmisión: visible solo si está EN VIVO y no venció su hora de fin
create policy "Visitantes leen transmision en vivo vigente" on public.transmisiones
  for select to anon, authenticated
  using (en_vivo and (termina_en is null or termina_en > now()));

-- Administradores: control total del contenido (leer todo, crear, editar, borrar)
do $$
declare
  t text;
begin
  foreach t in array array['campeonatos','categorias','partidos','noticias','albumes','fotos','transmisiones']
  loop
    execute format('create policy "Admins leen todo" on public.%I for select to authenticated using ((select private.es_admin()))', t);
    execute format('create policy "Admins crean" on public.%I for insert to authenticated with check ((select private.es_admin()))', t);
    execute format('create policy "Admins editan" on public.%I for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()))', t);
    execute format('create policy "Admins borran" on public.%I for delete to authenticated using ((select private.es_admin()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Permisos de la API (GRANT explícitos)
--    "Automatically expose new tables" está desactivado, así que sin
--    estos GRANT la Data API no puede ver las tablas. RLS decide QUÉ
--    filas; los GRANT deciden QUÉ operaciones y columnas.
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- Visitantes (anon): solo lectura, y solo de columnas públicas
grant select on public.campeonatos, public.categorias, public.partidos to anon;
grant select (id, slug, titulo, descripcion, contenido, portada_path, portada_alt,
              campeonato_id, categoria_id, partido_id, publicado_en, actualizado_en)
  on public.noticias to anon;
grant select (id, slug, titulo, descripcion, fecha, portada_path, portada_alt,
              campeonato_id, categoria_id, partido_id, publicado_en, actualizado_en)
  on public.albumes to anon;
grant select (id, album_id, path, mini_path, ancho, alto, alt, descripcion, orden)
  on public.fotos to anon;
grant select (id, titulo, youtube_url, en_vivo, termina_en, partido_id)
  on public.transmisiones to anon;
-- anon NO recibe ningún permiso sobre public.administradores.

-- Usuarios con sesión: operaciones completas; RLS las limita a los admins
grant select, insert, update, delete on
  public.campeonatos, public.categorias, public.partidos,
  public.noticias, public.albumes, public.fotos, public.transmisiones
  to authenticated;
grant select on public.administradores to authenticated;

-- service_role (solo para tareas de servidor, p. ej. respaldos; nunca en la web)
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- 10. Almacenamiento de fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Las fotos se ven por su URL pública. No se permite LISTAR el bucket a
-- visitantes. Solo los admins pueden subir, reemplazar, listar o borrar.
create policy "Admins listan fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos' and (select private.es_admin()));
create policy "Admins suben fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos' and (select private.es_admin()));
create policy "Admins reemplazan fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos' and (select private.es_admin()))
  with check (bucket_id = 'fotos' and (select private.es_admin()));
create policy "Admins borran fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos' and (select private.es_admin()));

commit;
