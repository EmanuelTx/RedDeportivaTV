-- =====================================================================
-- RedDeportivaTV · Migración 2: COBERTURAS, CATEGORÍAS POR CAMPEONATO,
--                               JORNADAS, BÚSQUEDA Y ORIGINALES
-- ---------------------------------------------------------------------
-- Jerarquía:
--   campeonato → categoría (opcional, propia de cada campeonato)
--              → jornada   (opcional, ej. "Fecha 2")
--              → partido   (orden manual dentro de la jornada)
--              → cobertura (fotos + video de YouTube)
--
-- La tabla public.albumes ES la cobertura (no se crea otra tabla).
-- Tipos de cobertura:
--   partido    : un partido (máximo una cobertura por partido)
--   jornada    : general de una jornada (inauguración, premiación…);
--                puede haber varias por jornada
--   campeonato : general de un campeonato o de una categoría
--   evento     : evento deportivo, con o sin campeonato
--   pendiente  : contenido anterior a esta migración, sin clasificar
--
-- Fechas (distintas a propósito):
--   fecha         : fecha REAL del partido o evento (archivo y buscador)
--   publicado_en  : primera vez que se hizo pública
--   creado_en     : creación del registro
--
-- Estados de fotos y de video (independientes):
--   fotos: pendiente → preparacion → disponible   ·   no_aplica (no tendrá)
--   video: pendiente → edicion     → disponible   ·   no_aplica (no tendrá)
--   El visitante solo lee el estado PÚBLICO calculado (fotos_estado_publico,
--   video_estado_publico): nunca el enlace de un video que no está
--   disponible ni rutas de fotos que no estén publicadas.
--
-- Datos existentes: NO se borran ni se cambian valores existentes.
--   * Los álbumes existentes quedan como tipo "pendiente", con sus fotos,
--     su dirección y su visibilidad actual (sin tocar actualizado_en).
--     Como nunca tuvieron video, su video queda "no_aplica" (la web no
--     promete un video que no existe); se puede cambiar desde el panel.
--   * Partidos, campeonatos, noticias, transmisiones y fotos: intactos.
--   * Si hubiera categorías cargadas (hoy hay 0), la migración se detiene
--     sin cambiar nada, para asignarlas a su campeonato a mano.
--
-- Se ejecuta en UNA transacción: si algo falla, no se aplica nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.categorias) then
    raise exception 'Hay categorías cargadas: primero hay que decidir a qué campeonato pertenece cada una. No se aplicó nada.';
  end if;
end;
$$;

-- Registro de migraciones aplicadas (privado). Sirve para distinguir el
-- contenido HEREDADO (creado antes de esta migración) del creado después.
create table if not exists private.migraciones (
  nombre      text primary key,
  aplicada_en timestamptz not null default now()
);
alter table private.migraciones enable row level security;  -- sin políticas: nadie de afuera
revoke all on private.migraciones from public, anon, authenticated;
insert into private.migraciones (nombre) values ('20261111000100_coberturas');

-- Extensiones gratuitas de PostgreSQL incluidas en Supabase
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- Texto en minúsculas y sin tildes (para buscar y para evitar duplicados)
create function private.normalizar(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')));
$$;

-- ---------------------------------------------------------------------
-- 1. Categorías propias de cada campeonato
-- ---------------------------------------------------------------------
alter table public.categorias
  add column campeonato_id uuid not null references public.campeonatos (id) on delete restrict;

-- La dirección corta deja de ser única en todo el sitio: es única
-- dentro de cada campeonato ("libre" puede existir en varios).
alter table public.categorias drop constraint categorias_slug_key;
alter table public.categorias
  add constraint categorias_campeonato_slug_key unique (campeonato_id, slug),
  add constraint categorias_id_campeonato_key unique (id, campeonato_id);
create index categorias_campeonato_idx on public.categorias (campeonato_id, orden);

-- Una categoría solo puede usarse con SU campeonato (clave doble).
alter table public.partidos
  add constraint partidos_categoria_del_campeonato
  foreign key (categoria_id, campeonato_id) references public.categorias (id, campeonato_id) on delete restrict;
alter table public.albumes
  add constraint albumes_categoria_del_campeonato
  foreign key (categoria_id, campeonato_id) references public.categorias (id, campeonato_id) on delete restrict,
  add constraint albumes_categoria_requiere_campeonato check (categoria_id is null or campeonato_id is not null);
alter table public.noticias
  add constraint noticias_categoria_del_campeonato
  foreign key (categoria_id, campeonato_id) references public.categorias (id, campeonato_id) on delete restrict,
  add constraint noticias_categoria_requiere_campeonato check (categoria_id is null or campeonato_id is not null);

-- ---------------------------------------------------------------------
-- 2. Jornadas (opcionales)
-- ---------------------------------------------------------------------
create table public.jornadas (
  id             uuid primary key default gen_random_uuid(),
  campeonato_id  uuid not null references public.campeonatos (id) on delete restrict,
  categoria_id   uuid,
  nombre         text not null check (char_length(nombre) between 1 and 60),
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160),
  fecha          date,
  orden          integer not null default 0,
  visible        boolean not null default true,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  foreign key (categoria_id, campeonato_id) references public.categorias (id, campeonato_id) on delete restrict
);
comment on table public.jornadas is
  'Jornadas o fechas de un campeonato (y categoría opcional). Agrupan partidos.';

-- Sin duplicados por escritura: "Fecha 2", "fecha 2" y "FECHA 2" son la
-- misma jornada dentro del mismo campeonato y categoría.
create unique index jornadas_sin_duplicados
  on public.jornadas (campeonato_id,
                      coalesce(categoria_id, '00000000-0000-0000-0000-000000000000'::uuid),
                      private.normalizar(nombre));
create index jornadas_listado_idx on public.jornadas (campeonato_id, categoria_id, orden, fecha);

alter table public.partidos
  add column jornada_id uuid references public.jornadas (id) on delete restrict,
  add column orden      integer not null default 0;
create index partidos_jornada_idx on public.partidos (jornada_id, orden, fecha, hora);
comment on column public.partidos.fase is 'Instancia: Final, Semifinal, Cuartos… (la jornada va en jornada_id).';

-- ---------------------------------------------------------------------
-- 3. Coberturas (tabla albumes)
-- ---------------------------------------------------------------------
alter table public.albumes
  add column tipo          text not null default 'pendiente'
                           check (tipo in ('partido', 'jornada', 'campeonato', 'evento', 'pendiente')),
  add column jornada_id    uuid references public.jornadas (id) on delete restrict,
  add column visible       boolean not null default false,
  add column estado_fotos  text not null default 'pendiente'
                           check (estado_fotos in ('pendiente', 'preparacion', 'disponible', 'no_aplica')),
  add column estado_video  text not null default 'pendiente'
                           check (estado_video in ('pendiente', 'edicion', 'disponible', 'no_aplica')),
  add column youtube_id    text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  add column actividad_en  timestamptz,
  add column busqueda      text not null default '';

alter table public.fotos
  add column original_path  text check (original_path ~ ('^albumes/' || album_id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,149}$')),
  add column original_bytes bigint check (original_bytes between 1 and 52428800);

-- Conservar el comportamiento de lo ya publicado: visible y con fotos
-- disponibles. Se desactivan un momento los disparadores existentes de
-- fechas para NO modificar actualizado_en ni publicado_en reales.
alter table public.albumes disable trigger tocar_actualizado;
alter table public.albumes disable trigger marcar_publicacion;
update public.albumes
   set visible = true, estado_fotos = 'disponible', estado_video = 'no_aplica',
       actividad_en = coalesce(publicado_en, creado_en)
 where estado in ('publicando', 'publicada');
alter table public.albumes enable trigger tocar_actualizado;
alter table public.albumes enable trigger marcar_publicacion;

-- Columnas calculadas que SÍ lee el visitante (nunca revelan lo privado)
alter table public.albumes
  add column fotos_disponibles boolean
             generated always as (estado = 'publicada') stored,
  add column video_publico     text
             generated always as (case when estado_video = 'disponible' then youtube_id end) stored,
  add column portada_publica   text
             generated always as (case when estado = 'publicada' then portada_path end) stored,
  -- Estado público: qué mensaje ve el visitante. "disponible" solo cuando
  -- el contenido realmente se publicó; mientras las fotos se mueven al
  -- bucket público o el video no tiene enlace, se informa "en preparación".
  add column fotos_estado_publico text
             generated always as (case
               when estado = 'publicada'                 then 'disponible'
               when estado_fotos = 'no_aplica'           then 'no_aplica'
               when estado_fotos in ('preparacion', 'disponible') or estado = 'publicando' then 'preparacion'
               else 'pendiente' end) stored,
  add column video_estado_publico text
             generated always as (case
               when estado_video = 'disponible' and youtube_id is not null then 'disponible'
               when estado_video = 'no_aplica'           then 'no_aplica'
               when estado_video in ('edicion', 'disponible') then 'edicion'
               else 'pendiente' end) stored;

-- Reglas por tipo
alter table public.albumes
  add constraint albumes_tipo_coherente check (
    case tipo
      when 'partido'    then partido_id is not null
      when 'jornada'    then jornada_id is not null and partido_id is null
      when 'campeonato' then campeonato_id is not null and jornada_id is null and partido_id is null
      when 'evento'     then jornada_id is null and partido_id is null
      else true                                    -- pendiente: sin requisitos
    end),
  -- Para el archivo histórico: lo visible y clasificado necesita su fecha real
  add constraint albumes_visible_con_fecha
      check (not visible or tipo = 'pendiente' or fecha is not null),
  add constraint albumes_video_disponible_con_id
      check (estado_video <> 'disponible' or youtube_id is not null),
  -- Fotos al bucket público solo si la cobertura es visible y "disponible"
  add constraint albumes_fotos_publicas_coherentes
      check (estado in ('borrador', 'despublicando') or (visible and estado_fotos = 'disponible')),
  -- Direcciones reservadas por las páginas del sitio
  add constraint albumes_slug_reservado check (slug not in ('archivo', 'buscar'));

-- Un partido tiene como máximo una cobertura
create unique index albumes_un_partido on public.albumes (partido_id) where partido_id is not null;

-- Índices para portada, catálogo, archivo y buscador
create index albumes_actividad_idx  on public.albumes (actividad_en desc) where visible;
create index albumes_fecha_real_idx on public.albumes (fecha desc) where visible;
create index albumes_jornada_idx    on public.albumes (jornada_id);
create index albumes_tipo_idx       on public.albumes (tipo);
create index albumes_busqueda_trgm  on public.albumes using gin (busqueda extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 4. Funciones internas y disparadores
-- ---------------------------------------------------------------------
-- 4a. Texto de búsqueda: título, descripción, tipo, campeonato, temporada,
--     categoría, jornada, equipos, instancia, lugar y la fecha real en
--     varias formas (2024, septiembre/setiembre 2024, 15/09/2024…).
create function private.texto_busqueda(a public.albumes)
returns text
language sql
stable
set search_path = ''
as $$
  select private.normalizar(concat_ws(' ',
    a.titulo, a.descripcion,
    case a.tipo when 'partido' then 'partido' when 'jornada' then 'jornada general'
                when 'campeonato' then 'campeonato general' when 'evento' then 'evento' end,
    c.nombre, c.temporada, k.nombre, j.nombre,
    p.equipo_local, p.equipo_visitante, p.fase, p.lugar,
    to_char(a.fecha, 'YYYY'),
    (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
           'septiembre','octubre','noviembre','diciembre'])[extract(month from a.fecha)::int],
    case when extract(month from a.fecha) = 9 then 'setiembre' end,
    to_char(a.fecha, 'DD/MM/YYYY'), to_char(a.fecha, 'MM/YYYY'), to_char(a.fecha, 'YYYY-MM-DD')))
  from (select 1) uno
  left join public.campeonatos c on c.id = a.campeonato_id
  left join public.categorias  k on k.id = a.categoria_id
  left join public.jornadas    j on j.id = a.jornada_id
  left join public.partidos    p on p.id = a.partido_id;
$$;

-- Backfill del texto de búsqueda de lo existente (sin tocar fechas)
alter table public.albumes disable trigger tocar_actualizado;
alter table public.albumes disable trigger marcar_publicacion;
update public.albumes a set busqueda = private.texto_busqueda(a);
alter table public.albumes enable trigger tocar_actualizado;
alter table public.albumes enable trigger marcar_publicacion;

-- 4b. Cobertura: copia campeonato, categoría, jornada y fecha desde el
--     partido o la jornada (una sola fuente de datos) y arma el texto
--     de búsqueda.
create function private.preparar_cobertura()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  if new.tipo = 'partido' and new.partido_id is not null then
    select campeonato_id, categoria_id, jornada_id, fecha into r
      from public.partidos where id = new.partido_id;
    if found then
      new.campeonato_id := r.campeonato_id;
      new.categoria_id  := r.categoria_id;
      new.jornada_id    := r.jornada_id;
      new.fecha         := coalesce(r.fecha, new.fecha);
    end if;
  elsif new.tipo = 'jornada' and new.jornada_id is not null then
    select campeonato_id, categoria_id, fecha into r
      from public.jornadas where id = new.jornada_id;
    if found then
      new.campeonato_id := r.campeonato_id;
      new.categoria_id  := r.categoria_id;
      new.fecha         := coalesce(new.fecha, r.fecha);
    end if;
  end if;
  new.busqueda := private.texto_busqueda(new);
  return new;
end;
$$;

create trigger preparar_cobertura
  before insert or update on public.albumes
  for each row execute function private.preparar_cobertura();

-- 4c. Partido dentro de una jornada: campeonato y categoría salen de la
--     jornada (así nunca se mezclan Libre y Senior).
create function private.preparar_partido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r record;
begin
  if new.jornada_id is not null then
    select campeonato_id, categoria_id, fecha into r from public.jornadas where id = new.jornada_id;
    if found then
      new.campeonato_id := r.campeonato_id;
      new.categoria_id  := r.categoria_id;
      new.fecha         := coalesce(new.fecha, r.fecha);
    end if;
  end if;
  return new;
end;
$$;

create trigger preparar_partido
  before insert or update on public.partidos
  for each row execute function private.preparar_partido();

-- 4d. Propagación: si se corrige un partido, una jornada, un campeonato o
--     una categoría, sus coberturas se actualizan solas.
create function private.propagar_cambios()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'partidos' then
    update public.albumes set partido_id = partido_id where partido_id = new.id;
  elsif tg_table_name = 'jornadas' then
    update public.partidos set jornada_id = jornada_id where jornada_id = new.id;
    update public.albumes  set jornada_id = jornada_id where jornada_id = new.id;
  elsif tg_table_name = 'campeonatos' then
    update public.albumes set campeonato_id = campeonato_id where campeonato_id = new.id;
  elsif tg_table_name = 'categorias' then
    update public.albumes set categoria_id = categoria_id where categoria_id = new.id;
  end if;
  return null;
end;
$$;

create trigger propagar_cambios after update on public.partidos for each row execute function private.propagar_cambios();
create trigger propagar_cambios after update on public.jornadas for each row execute function private.propagar_cambios();
create trigger propagar_cambios after update of nombre, temporada on public.campeonatos for each row execute function private.propagar_cambios();
create trigger propagar_cambios after update of nombre on public.categorias for each row execute function private.propagar_cambios();

-- 4e. Actividad pública: solo cambia con novedades para el visitante.
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

-- 4f. Dirección permanente después de la primera publicación
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
-- Jornadas: la dirección se guarda aparte del nombre, así renombrar
-- "Fecha 2" no cambia su URL. El panel avisa antes de cambiar la dirección.

create trigger tocar_actualizado before update on public.jornadas for each row execute function private.tocar_actualizado();

revoke all on function
  private.normalizar(text), private.texto_busqueda(public.albumes), private.preparar_cobertura(),
  private.preparar_partido(), private.propagar_cambios(), private.actividad_cobertura(), private.fijar_slug()
  from public, anon, authenticated;
-- normalizar la usan las búsquedas que ejecuta el visitante
grant execute on function private.normalizar(text) to anon, authenticated;
-- texto_busqueda la llama el disparador preparar_cobertura con los permisos
-- de quien guarda la cobertura (en la práctica, un administrador: RLS no
-- deja escribir a nadie más). Sin este permiso nadie podría guardar.
-- (Error detectado en el proyecto de pruebas, 12/11/2026.)
grant execute on function private.texto_busqueda(public.albumes) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Funciones de búsqueda (respetan RLS: SECURITY INVOKER)
-- ---------------------------------------------------------------------
-- Busca coberturas con texto tolerante y filtros. El visitante solo
-- recibe coberturas visibles con contenido disponible (RLS); un
-- administrador recibe también borradores. Nunca devuelve rutas de fotos
-- privadas ni videos en edición.
create function public.buscar_coberturas(
  p_texto      text    default null,
  p_campeonato uuid    default null,
  p_categoria  uuid    default null,
  p_jornada    uuid    default null,
  p_tipo       text    default null,
  p_desde      date    default null,
  p_hasta      date    default null,
  p_orden      text    default 'fecha',      -- 'fecha' (del partido/evento) | 'reciente' (agregadas o actualizadas)
  p_limite     integer default 24,
  p_offset     integer default 0,
  p_con_video  boolean default null)        -- true: solo coberturas con video publicado
returns table (
  id uuid, slug text, titulo text, tipo text, fecha date,
  campeonato_id uuid, categoria_id uuid, jornada_id uuid, partido_id uuid,
  portada_publica text, video_publico text, fotos_disponibles boolean,
  fotos_estado_publico text, video_estado_publico text,
  actividad_en timestamptz, publicado_en timestamptz,
  relevancia real, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (
    select private.normalizar(btrim(coalesce(p_texto, ''))) as t
  ), terminos as (
    -- Palabras de la búsqueda, sin palabras vacías ("de", "vs", "partido"…)
    select coalesce(array_agg(w), '{}') as palabras
    from consulta, regexp_split_to_table(consulta.t, '[^a-z0-9]+') w
    where w <> '' and w not in ('de','del','la','el','los','las','y','e','vs','v','contra','partido',
                                 'partidos','fotos','foto','video','videos','en','a','al','cobertura')
  ), filas as (
    select a.id, a.slug, a.titulo, a.tipo, a.fecha, a.campeonato_id, a.categoria_id, a.jornada_id,
           a.partido_id, a.portada_publica, a.video_publico, a.fotos_disponibles,
           a.fotos_estado_publico, a.video_estado_publico, a.actividad_en,
           a.publicado_en,
           case when cardinality(tt.palabras) = 0 then 0::real
                else ((select count(*) from unnest(tt.palabras) w where a.busqueda like '%' || w || '%')
                      + extensions.word_similarity(c.t, a.busqueda)
                      + case when private.normalizar(a.titulo) like '%' || c.t || '%' then 1 else 0 end)::real
           end as relevancia
    from public.albumes a, consulta c, terminos tt
    where (p_campeonato is null or a.campeonato_id = p_campeonato)
      and (p_categoria  is null or a.categoria_id  = p_categoria)
      and (p_jornada    is null or a.jornada_id    = p_jornada)
      and (p_tipo       is null or a.tipo          = p_tipo)
      and (p_desde      is null or a.fecha >= p_desde)
      and (p_hasta      is null or a.fecha <= p_hasta)
      and (p_con_video  is null or ((a.video_publico is not null) = p_con_video))
      -- Cada palabra tiene que aparecer, exacta o con un error leve de tipeo.
      -- Umbral 0,5 medido en el proyecto de pruebas: "alemnia"→Alemania 0,545;
      -- palabras de otros partidos o categorías ≤ 0,333.
      -- Años, números y meses se exigen EXACTOS ("2024" no es "2026",
      -- "setiembre" no es "noviembre").
      and not exists (
        select 1 from unnest(tt.palabras) w
        where not (a.busqueda like '%' || w || '%'
                   or (length(w) >= 4 and w !~ '[0-9]'
                       and w not in ('enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                                     'septiembre','setiembre','octubre','noviembre','diciembre')
                       and extensions.word_similarity(w, a.busqueda) >= 0.5)))
  )
  select f.id, f.slug, f.titulo, f.tipo, f.fecha, f.campeonato_id, f.categoria_id, f.jornada_id,
         f.partido_id, f.portada_publica, f.video_publico, f.fotos_disponibles,
         f.fotos_estado_publico, f.video_estado_publico, f.actividad_en,
         f.publicado_en, f.relevancia, count(*) over ()
  from filas f
  -- 'fecha': primero los partidos y eventos más recientes según su fecha
  --          REAL; lo que no tiene fecha confirmada va al final.
  -- 'reciente': lo agregado o completado últimamente (aunque sea antiguo).
  order by f.relevancia desc,
           case when p_orden = 'reciente' then coalesce(f.actividad_en, f.publicado_en) end desc nulls last,
           f.fecha desc nulls last,
           coalesce(f.actividad_en, f.publicado_en) desc nulls last,
           f.id
  limit least(greatest(coalesce(p_limite, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Archivo histórico: cantidad de coberturas por año y mes (fecha real)
create function public.archivo_coberturas()
returns table (anio integer, mes integer, cantidad bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select extract(year from a.fecha)::int, extract(month from a.fecha)::int, count(*)
  from public.albumes a
  where a.fecha is not null
  group by 1, 2
  order by 1 desc, 2 desc;
$$;

-- Panel: posibles duplicados antes de crear una cobertura
create function public.posibles_duplicados(
  p_excluir uuid, p_tipo text, p_partido uuid, p_jornada uuid,
  p_campeonato uuid, p_fecha date, p_titulo text)
returns table (id uuid, slug text, titulo text, tipo text, motivo text)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.slug, a.titulo, a.tipo,
         case when p_partido is not null and a.partido_id = p_partido then 'Mismo partido'
              when p_jornada is not null and a.jornada_id = p_jornada and a.tipo = 'jornada' then 'Otra cobertura general de la misma jornada'
              else 'Título parecido' end
  from public.albumes a
  where (p_excluir is null or a.id <> p_excluir)
    and ((p_partido is not null and a.partido_id = p_partido)
      or (p_jornada is not null and a.jornada_id = p_jornada and a.tipo = 'jornada')
      -- Títulos parecidos: solo entre coberturas generales. Las de partido ya
      -- tienen su control (un partido = una cobertura) y sus títulos se
      -- parecen siempre ("Equipo A vs. Equipo B" / "Equipo C vs. Equipo D").
      -- (Falso positivo detectado en el proyecto de pruebas, 12/11/2026.)
      or (p_partido is null and a.partido_id is null and coalesce(p_titulo, '') <> ''
          and (p_campeonato is null or a.campeonato_id = p_campeonato)
          and (p_fecha is null or a.fecha is null or abs(a.fecha - p_fecha) <= 7)
          and extensions.similarity(private.normalizar(a.titulo), private.normalizar(p_titulo)) >= 0.5))
  limit 10;
$$;

-- Panel: espacio usado por bucket (solo administradores)
create function public.uso_almacenamiento()
returns table (bucket text, archivos bigint, bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.es_admin() then
    raise exception 'Solo administradores' using errcode = '42501';
  end if;
  return query
    select o.bucket_id::text, count(*), coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
    from storage.objects o
    where o.bucket_id in ('fotos-borradores', 'fotos-publicas', 'fotos-originales')
    group by o.bucket_id;
end;
$$;

revoke all on function
  public.buscar_coberturas(text, uuid, uuid, uuid, text, date, date, text, integer, integer, boolean),
  public.archivo_coberturas(),
  public.posibles_duplicados(uuid, text, uuid, uuid, uuid, date, text),
  public.uso_almacenamiento()
  from public, anon, authenticated;
grant execute on function public.buscar_coberturas(text, uuid, uuid, uuid, text, date, date, text, integer, integer, boolean) to anon, authenticated;
grant execute on function public.archivo_coberturas() to anon, authenticated;
grant execute on function public.posibles_duplicados(uuid, text, uuid, uuid, uuid, date, text) to authenticated;
grant execute on function public.uso_almacenamiento() to authenticated;

-- ---------------------------------------------------------------------
-- 6. RLS y permisos
-- ---------------------------------------------------------------------
-- Coberturas: el visitante ve las visibles con fotos publicadas o video
-- disponible (incluye las "pendientes" que ya estaban publicadas).
alter policy "Visitantes leen albumes publicados" on public.albumes
  using (visible and (estado = 'publicada' or estado_video = 'disponible'));

grant select (tipo, jornada_id, actividad_en, fotos_disponibles, video_publico, portada_publica, busqueda,
              fotos_estado_publico, video_estado_publico)
  on public.albumes to anon;
revoke select (portada_path) on public.albumes from anon;  -- usa portada_publica
-- fotos.original_path / original_bytes: sin permiso para el visitante.

-- Jornadas
alter table public.jornadas enable row level security;
create policy "Visitantes leen jornadas visibles" on public.jornadas
  for select to anon, authenticated using (visible);
create policy "Admins leen todo"  on public.jornadas for select to authenticated using ((select private.es_admin()));
create policy "Admins crean"      on public.jornadas for insert to authenticated with check ((select private.es_admin()));
create policy "Admins editan"     on public.jornadas for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()));
create policy "Admins borran"     on public.jornadas for delete to authenticated using ((select private.es_admin()));

revoke all on public.jornadas from public, anon, authenticated;
grant select on public.jornadas to anon;
grant select, insert, update, delete on public.jornadas to authenticated;
grant all on public.jornadas to service_role;

-- ---------------------------------------------------------------------
-- 7. Originales (opcional, siempre privados)
--    La web usa versiones optimizadas; el original se guarda solo si se
--    elige en el panel y hay espacio. Nunca es público.
-- ---------------------------------------------------------------------
-- Si el bucket ya existiera (por ejemplo, tras una reversión), se fuerza a
-- PRIVADO con estos límites: nunca puede quedar público.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('fotos-originales', 'fotos-originales', false, 52428800, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Admins ven originales" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-originales' and (select private.es_admin()));
create policy "Admins suben originales" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-originales' and (select private.es_admin()) and private.ruta_valida(name));
create policy "Admins cambian originales" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-originales' and (select private.es_admin()))
  with check (bucket_id = 'fotos-originales' and (select private.es_admin()) and private.ruta_valida(name));
create policy "Admins borran originales" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-originales' and (select private.es_admin()));

commit;
