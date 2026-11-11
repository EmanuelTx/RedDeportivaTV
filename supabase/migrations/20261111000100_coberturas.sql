-- =====================================================================
-- RedDeportivaTV · Migración 2: álbumes → COBERTURAS
-- ---------------------------------------------------------------------
-- Una cobertura = fotos + video de YouTube + datos del partido o jornada.
-- Se amplía la tabla public.albumes (no se crea otra tabla): un solo
-- registro por cobertura, que editan los dos administradores.
--
-- Qué agrega:
--   * Dos tipos de cobertura:
--       - de un PARTIDO: partido_id; campeonato, categoría, fecha y
--         jornada se copian solos del partido y se mantienen al día;
--       - de una JORNADA/EVENTO: campeonato + fecha (+ categoría y
--         jornada opcionales), sin partido.
--   * Estados independientes:
--       - estado_fotos: pendiente | preparacion | disponible
--       - estado_video: pendiente | edicion | disponible  (+ youtube_id)
--       - visible: interruptor "Visible en la web"
--     La columna existente "estado" sigue siendo el mecanismo seguro que
--     mueve los archivos entre buckets (borrador → publicando → publicada
--     → despublicando). Para coberturas significa "fotos publicadas".
--   * actividad_en: fecha de la última novedad PÚBLICA (se hizo visible,
--     se publicaron las fotos o el video). No cambia con ediciones menores.
--   * La dirección (slug) queda fija desde la primera publicación
--     (también en noticias).
--
-- Seguridad:
--   * Los archivos solo pueden estar en el bucket público si la cobertura
--     es visible y sus fotos están "disponibles" (regla de la base).
--   * El visitante ve una cobertura si es visible y tiene fotos o video
--     disponible. Nunca ve: estados internos, el ID de un video que sigue
--     en edición, ni la portada si las fotos todavía no se publicaron.
--   * Los administradores mantienen exactamente los mismos permisos.
--
-- No borra datos ni tablas. Noticias, fotos, partidos y categorías no
-- cambian (salvo el bloqueo de slug publicado en noticias).
-- Se ejecuta en una sola transacción: si algo falla, no se aplica nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.albumes
  add column jornada       text check (char_length(jornada) <= 60),
  add column visible       boolean not null default false,
  add column estado_fotos  text not null default 'pendiente'
                           check (estado_fotos in ('pendiente', 'preparacion', 'disponible')),
  add column estado_video  text not null default 'pendiente'
                           check (estado_video in ('pendiente', 'edicion', 'disponible')),
  add column youtube_id    text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column actividad_en  timestamptz;

-- Si existiera algún álbum ya publicado, conserva su comportamiento
-- actual (visible y con fotos disponibles). Hoy no hay ninguno.
update public.albumes
   set visible = true, estado_fotos = 'disponible', actividad_en = coalesce(publicado_en, now())
 where estado in ('publicando', 'publicada');

-- Columnas calculadas que SÍ puede leer el visitante (nunca revelan
-- datos que todavía no son públicos).
alter table public.albumes
  add column fotos_disponibles boolean
             generated always as (estado = 'publicada') stored,
  add column video_publico     text
             generated always as (case when estado_video = 'disponible' then youtube_id end) stored,
  add column portada_publica   text
             generated always as (case when estado = 'publicada' then portada_path end) stored;

-- ---------------------------------------------------------------------
-- 2. Reglas de coherencia
-- ---------------------------------------------------------------------
alter table public.albumes
  -- El video solo puede estar "disponible" si tiene un ID de YouTube.
  add constraint albumes_video_disponible_con_id
      check (estado_video <> 'disponible' or youtube_id is not null),
  -- Las fotos solo pueden publicarse (archivos al bucket público) si la
  -- cobertura es visible y sus fotos están marcadas "disponibles".
  add constraint albumes_fotos_publicas_coherentes
      check (estado in ('borrador', 'despublicando') or (visible and estado_fotos = 'disponible')),
  -- Para estar visible, tiene que decir de qué partido o jornada es.
  add constraint albumes_visible_con_partido_o_jornada
      check (not visible or partido_id is not null or (campeonato_id is not null and fecha is not null));

-- Evitar duplicados accidentales (sin limitar coberturas legítimas):
--   * un partido tiene como máximo una cobertura;
--   * una cobertura de jornada no se repite con el mismo campeonato,
--     categoría, fecha y nombre de jornada. Las coberturas de partidos
--     distintos de la misma jornada no se ven afectadas.
create unique index albumes_un_partido
  on public.albumes (partido_id)
  where partido_id is not null;

create unique index albumes_una_jornada
  on public.albumes (campeonato_id,
                     coalesce(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid),
                     fecha,
                     lower(coalesce(jornada, '')))
  where partido_id is null and campeonato_id is not null and fecha is not null;

-- Índices para la portada y el catálogo
create index albumes_actividad_idx on public.albumes (actividad_en desc) where visible;
create index albumes_jornada_idx   on public.albumes (jornada);

-- ---------------------------------------------------------------------
-- 3. Disparadores
-- ---------------------------------------------------------------------
-- 3a. Cobertura de partido: copia campeonato, categoría, fecha y jornada
--     del partido (una sola fuente de datos: el partido).
create function private.sincronizar_cobertura()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  p record;
begin
  if new.partido_id is not null then
    select campeonato_id, categoria_id, fecha, fase into p
      from public.partidos where id = new.partido_id;
    if found then
      new.campeonato_id := p.campeonato_id;
      new.categoria_id  := p.categoria_id;
      new.fecha         := p.fecha;
      new.jornada       := p.fase;
    end if;
  end if;
  return new;
end;
$$;

create trigger sincronizar_cobertura
  before insert or update on public.albumes
  for each row execute function private.sincronizar_cobertura();

-- 3b. Si se corrige el partido, sus coberturas se actualizan solas.
create function private.propagar_partido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.albumes
     set campeonato_id = new.campeonato_id,
         categoria_id  = new.categoria_id,
         fecha         = new.fecha,
         jornada       = new.fase
   where partido_id = new.id;
  return null;
end;
$$;

create trigger propagar_partido
  after update of campeonato_id, categoria_id, fecha, fase on public.partidos
  for each row execute function private.propagar_partido();

-- 3c. Actividad pública: solo cambia cuando hay algo NUEVO para el
--     visitante (se hace visible, se publican fotos o se publica el video).
create function private.actividad_cobertura()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  publica_ahora boolean := new.visible and (new.estado = 'publicada' or new.estado_video = 'disponible');
  novedad boolean;
begin
  if tg_op = 'INSERT' then
    novedad := publica_ahora;
  else
    novedad := publica_ahora and (
         not (old.visible and (old.estado = 'publicada' or old.estado_video = 'disponible'))
      or (new.estado = 'publicada' and old.estado <> 'publicada')
      or (new.estado_video = 'disponible' and old.estado_video <> 'disponible'));
  end if;
  if novedad then
    new.actividad_en := now();
    new.publicado_en := coalesce(new.publicado_en, now());
  end if;
  return new;
end;
$$;

create trigger actividad_cobertura
  before insert or update on public.albumes
  for each row execute function private.actividad_cobertura();

-- 3d. Dirección permanente: después de la primera publicación, el slug
--     no se puede cambiar (rompería enlaces compartidos).
create function private.fijar_slug()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publicado_en is not null and new.slug is distinct from old.slug then
    raise exception 'La dirección (slug) ya fue publicada y no se puede cambiar';
  end if;
  return new;
end;
$$;

create trigger fijar_slug before update on public.albumes  for each row execute function private.fijar_slug();
create trigger fijar_slug before update on public.noticias for each row execute function private.fijar_slug();

-- Permisos EXECUTE: ninguno (los disparadores no los necesitan).
revoke all on function
  private.sincronizar_cobertura(), private.propagar_partido(),
  private.actividad_cobertura(), private.fijar_slug()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Qué ve el visitante
-- ---------------------------------------------------------------------
-- Antes: álbum con estado = 'publicada'.
-- Ahora: cobertura visible con fotos publicadas o video disponible.
alter policy "Visitantes leen albumes publicados" on public.albumes
  using (visible and (estado = 'publicada' or estado_video = 'disponible'));

-- Columnas públicas nuevas (solo las calculadas y seguras).
grant select (jornada, actividad_en, fotos_disponibles, video_publico, portada_publica)
  on public.albumes to anon;
-- La ruta de portada original puede apuntar a una foto todavía privada:
-- el visitante usa portada_publica en su lugar.
revoke select (portada_path) on public.albumes from anon;

-- Las fotos (tabla y archivos) siguen igual: solo se ven si las fotos de
-- la cobertura están publicadas (private.album_publicado / ruta_publicada),
-- y eso ahora implica visible + "disponibles" por la regla
-- albumes_fotos_publicas_coherentes.

commit;
