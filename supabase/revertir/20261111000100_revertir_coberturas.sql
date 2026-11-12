-- =====================================================================
-- RedDeportivaTV · REVERTIR la migración 2 (coberturas v2)
-- ---------------------------------------------------------------------
-- ⚠ Antes de usarlo: hacer un respaldo. Borra lo que agregó la
--   migración 2 y su contenido: jornadas, tipos, estados de fotos y
--   video, enlaces de YouTube, texto de búsqueda, orden de partidos,
--   referencias a originales y la asignación de categorías a campeonatos.
--   NO borra coberturas, fotos, partidos, campeonatos ni noticias.
--   Las coberturas vuelven a ser álbumes: con fotos publicadas siguen
--   publicadas; las que solo tenían video dejan de verse.
--   Si dos campeonatos tienen categorías con la misma dirección, la
--   reversión se detiene (la migración 1 exigía direcciones únicas).
--   El bucket "fotos-originales" no se borra desde SQL: vaciarlo y
--   borrarlo desde Storage si se desea.
-- =====================================================================

begin;

-- Visitante: regla anterior
alter policy "Visitantes leen albumes publicados" on public.albumes using (estado = 'publicada');
grant select (portada_path) on public.albumes to anon;

-- Originales
drop policy if exists "Admins ven originales"     on storage.objects;
drop policy if exists "Admins suben originales"   on storage.objects;
drop policy if exists "Admins cambian originales" on storage.objects;
drop policy if exists "Admins borran originales"  on storage.objects;

-- Funciones de búsqueda y panel
drop function if exists public.buscar_coberturas(text, uuid, uuid, uuid, text, date, date, text, integer, integer, boolean);
drop function if exists public.archivo_coberturas();
drop function if exists public.posibles_duplicados(uuid, text, uuid, uuid, uuid, date, text);
drop function if exists public.uso_almacenamiento();

-- Disparadores
drop trigger if exists fijar_slug          on public.noticias;
drop trigger if exists fijar_slug          on public.albumes;
drop trigger if exists actividad_cobertura on public.albumes;
drop trigger if exists preparar_cobertura  on public.albumes;
drop trigger if exists preparar_partido    on public.partidos;
drop trigger if exists propagar_cambios    on public.partidos;
drop trigger if exists propagar_cambios    on public.jornadas;
drop trigger if exists propagar_cambios    on public.campeonatos;
drop trigger if exists propagar_cambios    on public.categorias;
drop function if exists private.fijar_slug();
drop function if exists private.actividad_cobertura();
drop function if exists private.preparar_cobertura();
drop function if exists private.preparar_partido();
drop function if exists private.propagar_cambios();
drop function if exists private.texto_busqueda(public.albumes);

-- Coberturas
drop index if exists public.albumes_un_partido;
drop index if exists public.albumes_actividad_idx;
drop index if exists public.albumes_fecha_real_idx;
drop index if exists public.albumes_jornada_idx;
drop index if exists public.albumes_tipo_idx;
drop index if exists public.albumes_busqueda_trgm;
alter table public.albumes
  drop constraint if exists albumes_tipo_coherente,
  drop constraint if exists albumes_visible_con_fecha,
  drop constraint if exists albumes_video_disponible_con_id,
  drop constraint if exists albumes_fotos_publicas_coherentes,
  drop constraint if exists albumes_slug_reservado,
  drop constraint if exists albumes_categoria_del_campeonato,
  drop constraint if exists albumes_categoria_requiere_campeonato;
alter table public.albumes
  drop column if exists fotos_estado_publico,
  drop column if exists video_estado_publico,
  drop column if exists portada_publica,
  drop column if exists video_publico,
  drop column if exists fotos_disponibles,
  drop column if exists busqueda,
  drop column if exists actividad_en,
  drop column if exists youtube_id,
  drop column if exists estado_video,
  drop column if exists estado_fotos,
  drop column if exists visible,
  drop column if exists jornada_id,
  drop column if exists tipo;
alter table public.fotos
  drop column if exists original_path,
  drop column if exists original_bytes;
alter table public.noticias
  drop constraint if exists noticias_categoria_del_campeonato,
  drop constraint if exists noticias_categoria_requiere_campeonato;

-- Partidos y jornadas
alter table public.partidos drop constraint if exists partidos_categoria_del_campeonato;
drop index if exists public.partidos_jornada_idx;
alter table public.partidos drop column if exists jornada_id, drop column if exists orden;
drop table if exists public.jornadas;

-- Categorías: vuelven a ser generales
do $$
begin
  if exists (select slug from public.categorias group by slug having count(*) > 1) then
    raise exception 'Hay categorías con la misma dirección en distintos campeonatos: renombrarlas antes de revertir. No se aplicó nada.';
  end if;
end;
$$;
drop index if exists public.categorias_campeonato_idx;
alter table public.categorias
  drop constraint if exists categorias_campeonato_slug_key,
  drop constraint if exists categorias_id_campeonato_key;
alter table public.categorias add constraint categorias_slug_key unique (slug);
alter table public.categorias drop column if exists campeonato_id;

drop function if exists private.normalizar(text);
drop table if exists private.migraciones;  -- solo la usa esta migración
-- Las extensiones unaccent y pg_trgm quedan instaladas (no molestan).

commit;
