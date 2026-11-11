-- =====================================================================
-- RedDeportivaTV · REVERTIR la migración 2 (coberturas)
-- ---------------------------------------------------------------------
-- ⚠ Borra las columnas nuevas y su contenido (estados de fotos y video,
-- enlaces de YouTube, jornada, actividad). Las coberturas vuelven a ser
-- álbumes comunes: las que tengan fotos publicadas siguen publicadas;
-- las que solo tenían video dejan de verse. No toca fotos ni archivos.
-- Usar solo si la migración 2 quedó mal.
-- =====================================================================

begin;

-- Visitante: vuelve la regla anterior y la columna de portada original
alter policy "Visitantes leen albumes publicados" on public.albumes
  using (estado = 'publicada');
grant select (portada_path) on public.albumes to anon;

-- Disparadores y funciones
drop trigger if exists fijar_slug            on public.noticias;
drop trigger if exists fijar_slug            on public.albumes;
drop trigger if exists actividad_cobertura   on public.albumes;
drop trigger if exists sincronizar_cobertura on public.albumes;
drop trigger if exists propagar_partido      on public.partidos;
drop function if exists private.fijar_slug();
drop function if exists private.actividad_cobertura();
drop function if exists private.propagar_partido();
drop function if exists private.sincronizar_cobertura();

-- Índices y reglas
drop index if exists public.albumes_un_partido;
drop index if exists public.albumes_una_jornada;
drop index if exists public.albumes_actividad_idx;
drop index if exists public.albumes_jornada_idx;
alter table public.albumes
  drop constraint if exists albumes_video_disponible_con_id,
  drop constraint if exists albumes_fotos_publicas_coherentes,
  drop constraint if exists albumes_visible_con_partido_o_jornada;

-- Columnas (primero las calculadas)
alter table public.albumes
  drop column if exists portada_publica,
  drop column if exists video_publico,
  drop column if exists fotos_disponibles,
  drop column if exists actividad_en,
  drop column if exists youtube_id,
  drop column if exists estado_video,
  drop column if exists estado_fotos,
  drop column if exists visible,
  drop column if exists jornada;

commit;
