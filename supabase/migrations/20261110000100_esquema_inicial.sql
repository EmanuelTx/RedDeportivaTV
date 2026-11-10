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
--     permisos de la API (GRANT) se dan explícitamente acá, después de
--     quitar cualquier permiso heredado.
--   * Fotos en DOS buckets:
--       - "fotos-borradores": PRIVADO. Todo se sube acá primero.
--       - "fotos-publicas":   público por URL, pero la base de datos solo
--         deja poner un archivo si su noticia/álbum ya está publicado.
--     Una publicación no puede volver a borrador (ni borrarse) mientras
--     tenga archivos en el bucket público.
--     Ambos: solo JPG/PNG/WebP y hasta 5 MB por archivo.
--
-- Rutas de archivos (iguales en los dos buckets):
--   albumes/<id del álbum>/<archivo>     noticias/<id de la noticia>/<archivo>
--
-- No borra ni modifica nada existente: solo crea objetos nuevos. Si algún
-- objeto ya existiera, la migración falla y no se aplica nada.
-- Se ejecuta en una sola transacción. No contiene claves ni correos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Esquema privado para funciones internas (NO expuesto por la API)
-- ---------------------------------------------------------------------
create schema private;
revoke all on schema private from public;
-- "usage" solo permite que las políticas RLS llamen a estas funciones;
-- el esquema no está en la lista de esquemas expuestos de la Data API.
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

-- Máximo dos administradores (con bloqueo para que dos altas simultáneas
-- no puedan pasar el límite)
create function private.limitar_administradores()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(hashtext('rdtv_administradores'));
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
-- SECURITY DEFINER: lee la tabla aunque quien consulta no pueda. Solo
-- devuelve verdadero/falso sobre uno mismo (auth.uid() sale del token
-- firmado por Supabase; no se puede falsificar desde la web).
create function private.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.administradores a where a.user_id = (select auth.uid())
  );
$$;

-- Fecha de última modificación
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

-- Formato de ruta permitido: albumes|noticias / <uuid> / <archivo>
create function private.ruta_valida(p_ruta text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_ruta ~ '^(albumes|noticias)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$', false);
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
  -- La portada tiene que estar en la carpeta de ESTA noticia
  portada_path   text check (portada_path ~ ('^noticias/' || id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$')),
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
  portada_path   text check (portada_path ~ ('^albumes/' || id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$')),
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
  -- El archivo tiene que estar en la carpeta de SU álbum
  path        text not null unique
              check (path ~ ('^albumes/' || album_id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$')),
  mini_path   text
              check (mini_path ~ ('^albumes/' || album_id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$')),
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
-- 7. Funciones que consultan las tablas
-- ---------------------------------------------------------------------
-- ¿El álbum está publicado? (para mostrar sus fotos a visitantes, que no
-- tienen permiso sobre la columna albumes.estado)
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

-- ¿La ruta pertenece a una noticia/álbum PUBLICADO? Decide qué archivos
-- pueden entrar al bucket público.
create function private.ruta_publicada(p_ruta text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.ruta_valida(p_ruta) then
    return false;
  end if;
  v_id := split_part(p_ruta, '/', 2)::uuid;
  if split_part(p_ruta, '/', 1) = 'albumes' then
    return exists (select 1 from public.albumes a where a.id = v_id and a.estado = 'publicada');
  else
    return exists (select 1 from public.noticias n where n.id = v_id and n.estado = 'publicada');
  end if;
end;
$$;

-- Impide que una publicación vuelva a borrador o se borre mientras tenga
-- archivos en el bucket público (primero hay que pasarlos al privado).
-- También impide cambiar el id, porque las rutas de archivos dependen de él.
-- SECURITY INVOKER: solo lo ejecutan quienes ya pueden editar (admins).
create function private.proteger_fotos_publicas()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefijo text;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'No se puede cambiar el identificador de una publicación';
  end if;

  if old.estado = 'publicada' and (tg_op = 'DELETE' or new.estado <> 'publicada') then
    v_prefijo := tg_table_name || '/' || old.id::text || '/';
    if exists (
      select 1 from storage.objects o
      where o.bucket_id = 'fotos-publicas' and starts_with(o.name, v_prefijo)
    ) then
      raise exception 'Primero hay que pasar las fotos de esta publicación al bucket privado (fotos-borradores)';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Disparadores
-- ---------------------------------------------------------------------
create trigger tocar_actualizado before update on public.campeonatos   for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.categorias    for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.partidos      for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.noticias      for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.albumes       for each row execute function private.tocar_actualizado();
create trigger tocar_actualizado before update on public.transmisiones for each row execute function private.tocar_actualizado();

create trigger marcar_publicacion before insert or update on public.noticias for each row execute function private.marcar_publicacion();
create trigger marcar_publicacion before insert or update on public.albumes  for each row execute function private.marcar_publicacion();

create trigger proteger_fotos_publicas before update or delete on public.noticias for each row execute function private.proteger_fotos_publicas();
create trigger proteger_fotos_publicas before update or delete on public.albumes  for each row execute function private.proteger_fotos_publicas();

-- ---------------------------------------------------------------------
-- 9. Permisos EXECUTE mínimos sobre las funciones
--    (Postgres da EXECUTE a todos por defecto: se quita y se da solo
--    a quien lo necesita. Las funciones de disparadores no necesitan
--    EXECUTE de nadie para funcionar.)
-- ---------------------------------------------------------------------
revoke all on function
  private.limitar_administradores(), private.es_admin(), private.tocar_actualizado(),
  private.marcar_publicacion(), private.ruta_valida(text), private.album_publicado(uuid),
  private.ruta_publicada(text), private.proteger_fotos_publicas()
  from public, anon, authenticated;

grant execute on function private.album_publicado(uuid) to anon, authenticated;  -- fotos visibles
grant execute on function private.es_admin()            to authenticated;        -- políticas de admins
grant execute on function private.ruta_valida(text)     to authenticated;        -- subida de fotos
grant execute on function private.ruta_publicada(text)  to authenticated;        -- bucket público

-- ---------------------------------------------------------------------
-- 10. Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table public.administradores enable row level security;
alter table public.campeonatos     enable row level security;
alter table public.categorias      enable row level security;
alter table public.partidos        enable row level security;
alter table public.noticias        enable row level security;
alter table public.albumes         enable row level security;
alter table public.fotos           enable row level security;
alter table public.transmisiones   enable row level security;

-- Administradores: cada admin solo ve su propia fila (para que el panel
-- sepa si tiene permiso). No hay políticas de escritura: nadie puede
-- agregar, cambiar ni quitar admins desde la web.
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

-- Fotos: visibles solo si su álbum está publicado
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
-- 11. Permisos de la API (GRANT explícitos)
--     Primero se quita TODO permiso que pudiera venir por defecto
--     (incluido TRUNCATE, que RLS no controla). Después se da solo lo
--     necesario. RLS decide QUÉ filas; los GRANT, QUÉ operaciones y columnas.
-- ---------------------------------------------------------------------
revoke all on
  public.administradores, public.campeonatos, public.categorias, public.partidos,
  public.noticias, public.albumes, public.fotos, public.transmisiones
  from public, anon, authenticated;

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

-- Usuarios con sesión: leer/crear/editar/borrar; RLS lo limita a los admins.
-- (Sin TRUNCATE, REFERENCES ni TRIGGER.)
grant select, insert, update, delete on
  public.campeonatos, public.categorias, public.partidos,
  public.noticias, public.albumes, public.fotos, public.transmisiones
  to authenticated;
-- Administradores: solo lectura (de su propia fila, por RLS).
grant select on public.administradores to authenticated;

-- service_role (solo tareas de servidor, p. ej. respaldos; nunca en la web)
grant all on
  public.administradores, public.campeonatos, public.categorias, public.partidos,
  public.noticias, public.albumes, public.fotos, public.transmisiones
  to service_role;

-- ---------------------------------------------------------------------
-- 12. Almacenamiento de fotos (dos buckets)
--     Si ya existiera un bucket con estos nombres, la migración falla
--     sin cambiar nada (no se sobrescribe ninguna configuración).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('fotos-borradores', 'fotos-borradores', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('fotos-publicas',   'fotos-publicas',   true,  5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Bucket PRIVADO: solo admins, y solo con rutas válidas.
create policy "Admins ven fotos privadas" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-borradores' and (select private.es_admin()));
create policy "Admins suben fotos privadas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-borradores' and (select private.es_admin()) and private.ruta_valida(name));
create policy "Admins cambian fotos privadas" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-borradores' and (select private.es_admin()))
  with check (bucket_id = 'fotos-borradores' and (select private.es_admin()) and private.ruta_valida(name));
create policy "Admins borran fotos privadas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-borradores' and (select private.es_admin()));

-- Bucket PÚBLICO: cualquiera abre un archivo por su URL, pero nadie puede
-- listar el contenido salvo los admins. Un archivo solo puede ENTRAR
-- (subirse, moverse o renombrarse) si su noticia/álbum está publicado.
create policy "Admins listan fotos publicas" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-publicas' and (select private.es_admin()));
create policy "Admins publican fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-publicas' and (select private.es_admin()) and private.ruta_publicada(name));
create policy "Admins cambian fotos publicas" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-publicas' and (select private.es_admin()))
  with check (bucket_id = 'fotos-publicas' and (select private.es_admin()) and private.ruta_publicada(name));
create policy "Admins retiran fotos publicas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-publicas' and (select private.es_admin()));

commit;
