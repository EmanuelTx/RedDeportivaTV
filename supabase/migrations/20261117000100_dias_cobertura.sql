-- =====================================================================
-- RedDeportivaTV · Migración 3: COBERTURA DEL DÍA y VIDEO RESUMEN GENERAL
-- ---------------------------------------------------------------------
-- Problema: en un día se cubren 8 a 10 partidos de un mismo campeonato y
-- hay UN solo video resumen para todos. Hoy cada partido es una
-- publicación aparte y el video general no tiene dónde guardarse.
--
-- Solución (aditiva, sin tocar lo existente):
--   * Tabla public.dias_cobertura: un registro por (campeonato, fecha real)
--     con su enlace permanente y su video resumen general.
--   * Se CREA SOLA cuando se guarda la primera cobertura de partido (o
--     general de jornada) de ese campeonato y día, y se borra sola si
--     queda vacía y sin video. Nadie sube nada dos veces.
--   * Los partidos siguen siendo coberturas (tabla albumes) con su propia
--     galería, resultado y enlace /coberturas/<slug>: NO cambian.
--   * Funciones nuevas con los permisos del usuario (SECURITY INVOKER):
--       buscar_entradas  → catálogo agrupado por día (y coberturas sueltas)
--       videos_publicos  → sección Videos, sin duplicados
--     y archivo_coberturas() pasa a contar días en lugar de partidos.
--
-- Lo que NO se modifica: albumes, fotos, noticias, transmisiones,
-- partidos, campeonatos, categorías, jornadas, Storage ni usuarios.
-- Las coberturas sin fecha real NO se agrupan ni se les inventa fecha.
--
-- Se ejecuta en UNA transacción: si algo falla, no se aplica nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Comprobaciones previas
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('private.migraciones') is null
     or not exists (select 1 from private.migraciones where nombre = '20261111000100_coberturas') then
    raise exception 'Falta la migración 2 (coberturas). No se aplicó nada.';
  end if;
end;
$$;
insert into private.migraciones (nombre) values ('20261117000100_dias_cobertura');

-- ---------------------------------------------------------------------
-- 1. Tabla de la cobertura del día
-- ---------------------------------------------------------------------
create table public.dias_cobertura (
  id             uuid primary key default gen_random_uuid(),
  campeonato_id  uuid not null references public.campeonatos (id) on delete restrict,
  fecha          date not null,
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 160),
  estado_video   text not null default 'pendiente'
                 check (estado_video in ('pendiente', 'edicion', 'disponible', 'no_aplica')),
  youtube_id     text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  descripcion    text check (char_length(descripcion) <= 300),
  video_en       timestamptz,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (campeonato_id, fecha),
  constraint dias_video_disponible_con_id check (estado_video <> 'disponible' or youtube_id is not null),
  -- Lo único que ve el visitante del video (nunca un enlace que no está disponible)
  video_publico        text generated always as (case when estado_video = 'disponible' then youtube_id end) stored,
  video_estado_publico text generated always as (case
      when estado_video = 'disponible' and youtube_id is not null then 'disponible'
      when estado_video = 'no_aplica'                             then 'no_aplica'
      when estado_video in ('edicion', 'disponible')              then 'edicion'
      else 'pendiente' end) stored
);
comment on table public.dias_cobertura is
  'Cobertura del día: un campeonato en una fecha real. Agrupa los partidos de ese día y guarda el video resumen general.';

create index dias_cobertura_fecha_idx on public.dias_cobertura (fecha desc);

-- ---------------------------------------------------------------------
-- 2. Quién puede ver un día (misma regla que las coberturas)
-- ---------------------------------------------------------------------
-- Un día es público si tiene su video disponible o al menos una cobertura
-- visible con fotos publicadas o video. La función es SECURITY DEFINER
-- (como album_publicado) porque el visitante no puede leer las columnas
-- internas de albumes (visible, estado).
create function private.dia_publico(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dias_cobertura d
    where d.id = p_id
      and (d.estado_video = 'disponible'
           or exists (select 1 from public.albumes a
                      where a.campeonato_id = d.campeonato_id and a.fecha = d.fecha
                        and a.tipo in ('partido', 'jornada')
                        and a.visible and (a.estado = 'publicada' or a.estado_video = 'disponible'))));
$$;
revoke all on function private.dia_publico(uuid) from public, anon, authenticated;
grant execute on function private.dia_publico(uuid) to anon, authenticated;

alter table public.dias_cobertura enable row level security;
create policy "Visitantes leen dias publicos" on public.dias_cobertura
  for select to anon, authenticated using (private.dia_publico(id));
create policy "Admins leen todo" on public.dias_cobertura for select to authenticated using ((select private.es_admin()));
create policy "Admins crean"     on public.dias_cobertura for insert to authenticated with check ((select private.es_admin()));
create policy "Admins editan"    on public.dias_cobertura for update to authenticated using ((select private.es_admin())) with check ((select private.es_admin()));
create policy "Admins borran"    on public.dias_cobertura for delete to authenticated using ((select private.es_admin()));

revoke all on public.dias_cobertura from public, anon, authenticated;
-- El visitante lee solo lo público: nunca estado_video ni youtube_id.
grant select (id, campeonato_id, fecha, slug, descripcion, video_en, video_publico, video_estado_publico)
  on public.dias_cobertura to anon;
grant select, insert, update, delete on public.dias_cobertura to authenticated;
grant all on public.dias_cobertura to service_role;

-- ---------------------------------------------------------------------
-- 3. Contenido existente: un día por cada campeonato y fecha ya cubiertos
--    (solo coberturas con fecha real; las sin fecha quedan como están)
-- ---------------------------------------------------------------------
insert into public.dias_cobertura (campeonato_id, fecha, slug)
select distinct a.campeonato_id, a.fecha, c.slug || '-' || to_char(a.fecha, 'YYYY-MM-DD')
from public.albumes a
join public.campeonatos c on c.id = a.campeonato_id
where a.tipo in ('partido', 'jornada') and a.fecha is not null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 4. Disparadores
-- ---------------------------------------------------------------------
-- 4a. Al guardar una cobertura de partido o general de jornada con
--     campeonato y fecha, el día existe (se crea si hace falta).
create function private.asegurar_dia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_slug text;
begin
  if new.tipo in ('partido', 'jornada') and new.campeonato_id is not null and new.fecha is not null then
    select c.slug || '-' || to_char(new.fecha, 'YYYY-MM-DD') into v_slug
      from public.campeonatos c where c.id = new.campeonato_id;
    insert into public.dias_cobertura (campeonato_id, fecha, slug)
      values (new.campeonato_id, new.fecha, v_slug)
      on conflict (campeonato_id, fecha) do nothing;
  end if;
  return null;
end;
$$;
create trigger asegurar_dia after insert or update on public.albumes
  for each row execute function private.asegurar_dia();

-- 4b. Si una cobertura cambia de día o se borra y el día queda vacío y sin
--     video ni descripción, el día se borra solo.
create function private.limpiar_dia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.tipo in ('partido', 'jornada') and old.campeonato_id is not null and old.fecha is not null
     and (tg_op = 'DELETE'
          or (old.tipo, old.campeonato_id, old.fecha) is distinct from (new.tipo, new.campeonato_id, new.fecha)) then
    delete from public.dias_cobertura d
     where d.campeonato_id = old.campeonato_id and d.fecha = old.fecha
       and d.youtube_id is null and d.estado_video in ('pendiente', 'no_aplica') and d.descripcion is null
       and not exists (select 1 from public.albumes a
                       where a.campeonato_id = d.campeonato_id and a.fecha = d.fecha
                         and a.tipo in ('partido', 'jornada') and a.id <> old.id);
  end if;
  return null;
end;
$$;
create trigger limpiar_dia after update or delete on public.albumes
  for each row execute function private.limpiar_dia();

-- 4c. El enlace permanente y el día no se cambian; el video marca su novedad.
create function private.dia_fijo_y_novedad()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.slug is distinct from old.slug then
      raise exception 'La dirección del día ya está publicada y no se puede cambiar';
    end if;
    if new.campeonato_id is distinct from old.campeonato_id or new.fecha is distinct from old.fecha then
      raise exception 'Un día no puede cambiar de campeonato ni de fecha';
    end if;
  end if;
  if new.estado_video = 'disponible'
     and (tg_op = 'INSERT' or old.estado_video <> 'disponible' or old.youtube_id is distinct from new.youtube_id) then
    new.video_en := now();
  end if;
  return new;
end;
$$;
create trigger dia_fijo_y_novedad before insert or update on public.dias_cobertura
  for each row execute function private.dia_fijo_y_novedad();
create trigger tocar_actualizado before update on public.dias_cobertura
  for each row execute function private.tocar_actualizado();

revoke all on function private.asegurar_dia(), private.limpiar_dia(), private.dia_fijo_y_novedad()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Catálogo agrupado por día
-- ---------------------------------------------------------------------
-- Devuelve UNA entrada por día (campeonato + fecha real) y una por cada
-- cobertura que no se agrupa (eventos, generales de campeonato y las
-- anteriores sin clasificar, sin fecha). Mismos filtros y misma búsqueda
-- tolerante que buscar_coberturas; la relevancia de un día es la de su
-- mejor partido. Respeta RLS: el visitante solo recibe lo público.
create function public.buscar_entradas(
  p_texto      text    default null,
  p_campeonato uuid    default null,
  p_categoria  uuid    default null,
  p_jornada    uuid    default null,
  p_tipo       text    default null,
  p_desde      date    default null,
  p_hasta      date    default null,
  p_orden      text    default 'fecha',      -- 'fecha' (real) | 'reciente' (agregadas o completadas)
  p_limite     integer default 24,
  p_offset     integer default 0)
returns table (
  clave text, es_dia boolean, id uuid, slug text, titulo text, tipo text, fecha date,
  campeonato_id uuid, categoria_id uuid, jornada_id uuid, partido_id uuid,
  categorias uuid[], partidos integer, con_fotos integer,
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
    select coalesce(array_agg(w), '{}') as palabras
    from consulta, regexp_split_to_table(consulta.t, '[^a-z0-9]+') w
    where w <> '' and w not in ('de','del','la','el','los','las','y','e','vs','v','contra','partido',
                                 'partidos','fotos','foto','video','videos','en','a','al','cobertura')
  ), filas as (
    select a.id, a.slug, a.titulo, a.tipo, a.fecha, a.campeonato_id, a.categoria_id, a.jornada_id,
           a.partido_id, a.portada_publica, a.video_publico, a.fotos_disponibles,
           a.fotos_estado_publico, a.video_estado_publico, a.actividad_en, a.publicado_en,
           (a.tipo in ('partido', 'jornada') and a.campeonato_id is not null and a.fecha is not null) as agrupable,
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
      -- Misma tolerancia a errores de tipeo que buscar_coberturas (ver su comentario).
      and not exists (
        select 1 from unnest(tt.palabras) w
        where not (a.busqueda like '%' || w || '%'
                   or (length(w) >= 4 and w !~ '[0-9]'
                       and w not in ('enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                                     'septiembre','setiembre','octubre','noviembre','diciembre')
                       and extensions.word_similarity(w, a.busqueda) >= 0.5)))
  ), dias as (
    select d.id, d.slug, d.campeonato_id, d.fecha, d.video_publico as dia_video, d.video_estado_publico as dia_estado, d.video_en,
           count(*) filter (where f.tipo = 'partido')::int as partidos,
           count(*) filter (where f.fotos_disponibles)::int as con_fotos,
           bool_or(f.fotos_estado_publico = 'preparacion') as en_preparacion,
           array_agg(distinct f.categoria_id) filter (where f.categoria_id is not null) as categorias,
           max(f.relevancia) as relevancia,
           max(f.actividad_en) as actividad,
           max(f.publicado_en) as publicado,
           (array_agg(f.portada_publica order by k.orden, k.nombre, j.orden, p.orden, p.hora, f.titulo)
              filter (where f.portada_publica is not null))[1] as portada,
           (array_agg(f.video_publico order by f.titulo) filter (where f.video_publico is not null))[1] as video_partido
    from filas f
    join public.dias_cobertura d on d.campeonato_id = f.campeonato_id and d.fecha = f.fecha
    left join public.categorias k on k.id = f.categoria_id
    left join public.jornadas j on j.id = f.jornada_id
    left join public.partidos p on p.id = f.partido_id
    where f.agrupable
    group by d.id
  ), entradas as (
    select 'dia:' || x.id::text as clave, true as es_dia, x.id, x.slug, null::text as titulo, 'dia'::text as tipo, x.fecha,
           x.campeonato_id, null::uuid as categoria_id, null::uuid as jornada_id, null::uuid as partido_id,
           coalesce(x.categorias, '{}'::uuid[]) as categorias, x.partidos, x.con_fotos,
           x.portada as portada_publica,
           coalesce(x.dia_video, x.video_partido) as video_publico,
           (x.con_fotos > 0) as fotos_disponibles,
           case when x.con_fotos > 0 then 'disponible' when x.en_preparacion then 'preparacion' else 'pendiente' end as fotos_estado_publico,
           case when x.dia_video is not null or x.video_partido is not null then 'disponible' else x.dia_estado end as video_estado_publico,
           greatest(x.actividad, x.video_en) as actividad_en, x.publicado as publicado_en, x.relevancia
    from dias x
    union all
    select 'cob:' || f.id::text, false, f.id, f.slug, f.titulo, f.tipo, f.fecha,
           f.campeonato_id, f.categoria_id, f.jornada_id, f.partido_id,
           case when f.categoria_id is null then '{}'::uuid[] else array[f.categoria_id] end, 0,
           case when f.fotos_disponibles then 1 else 0 end,
           f.portada_publica, f.video_publico, f.fotos_disponibles, f.fotos_estado_publico, f.video_estado_publico,
           f.actividad_en, f.publicado_en, f.relevancia
    from filas f
    where not f.agrupable
       or not exists (select 1 from public.dias_cobertura d where d.campeonato_id = f.campeonato_id and d.fecha = f.fecha)
  )
  select e.clave, e.es_dia, e.id, e.slug, e.titulo, e.tipo, e.fecha, e.campeonato_id, e.categoria_id, e.jornada_id,
         e.partido_id, e.categorias, e.partidos, e.con_fotos, e.portada_publica, e.video_publico, e.fotos_disponibles,
         e.fotos_estado_publico, e.video_estado_publico, e.actividad_en, e.publicado_en, e.relevancia,
         count(*) over ()
  from entradas e
  -- 'fecha': lo más reciente según la fecha REAL; sin fecha confirmada, al final.
  -- 'reciente': lo agregado o completado últimamente (aunque sea antiguo).
  order by e.relevancia desc,
           case when p_orden = 'reciente' then e.actividad_en end desc nulls last,
           e.fecha desc nulls last,
           e.actividad_en desc nulls last,
           e.clave
  limit least(greatest(coalesce(p_limite, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------
-- 6. Videos públicos (sección Videos): sin duplicados
-- ---------------------------------------------------------------------
-- Une el video resumen de cada día y los videos propios de partidos. Si el
-- mismo video está en las dos partes, aparece una sola vez (se prefiere el
-- del día). Orden: fecha real más reciente primero.
create function public.videos_publicos(p_limite integer default 4)
returns table (youtube_id text, es_dia boolean, slug text, titulo text,
               campeonato_id uuid, categoria_id uuid, fecha date, novedad timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.youtube_id, v.es_dia, v.slug, v.titulo, v.campeonato_id, v.categoria_id, v.fecha, v.novedad
  from (
    select distinct on (u.youtube_id) u.*
    from (
      select d.video_publico as youtube_id, true as es_dia, d.slug, null::text as titulo,
             d.campeonato_id, null::uuid as categoria_id, d.fecha,
             coalesce(d.video_en, d.fecha::timestamptz) as novedad
      from public.dias_cobertura d
      where d.video_publico is not null
      union all
      select a.video_publico, false, a.slug, a.titulo, a.campeonato_id, a.categoria_id, a.fecha,
             coalesce(a.actividad_en, a.publicado_en)
      from public.albumes a
      where a.video_publico is not null
    ) u
    order by u.youtube_id, u.es_dia desc
  ) v
  order by v.fecha desc nulls last, v.novedad desc nulls last
  limit least(greatest(coalesce(p_limite, 4), 1), 24);
$$;

-- ---------------------------------------------------------------------
-- 7. Archivo por año y mes: ahora cuenta DÍAS (y coberturas sueltas)
-- ---------------------------------------------------------------------
create or replace function public.archivo_coberturas()
returns table (anio integer, mes integer, cantidad bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select extract(year from e.fecha)::int, extract(month from e.fecha)::int, count(*)
  from (
    select a.fecha from public.albumes a
    where a.tipo in ('partido', 'jornada') and a.campeonato_id is not null and a.fecha is not null
    group by a.campeonato_id, a.fecha
    union all
    select a.fecha from public.albumes a
    where a.fecha is not null
      and not (a.tipo in ('partido', 'jornada') and a.campeonato_id is not null)
  ) e
  group by 1, 2
  order by 1 desc, 2 desc;
$$;

revoke all on function
  public.buscar_entradas(text, uuid, uuid, uuid, text, date, date, text, integer, integer),
  public.videos_publicos(integer)
  from public, anon, authenticated;
grant execute on function public.buscar_entradas(text, uuid, uuid, uuid, text, date, date, text, integer, integer) to anon, authenticated;
grant execute on function public.videos_publicos(integer) to anon, authenticated;

commit;
