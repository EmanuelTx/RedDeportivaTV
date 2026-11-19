-- =====================================================================
-- RedDeportivaTV · REVERTIR la migración 3 (cobertura del día)
-- ---------------------------------------------------------------------
-- ⚠ Antes de usarlo: hacer un respaldo. Borra la tabla dias_cobertura y,
--   con ella, los videos resumen generales cargados por día. NO borra
--   coberturas, fotos, partidos, noticias ni archivos.
--   Después de revertir hay que volver a la versión anterior de la web
--   (la nueva usa buscar_entradas y videos_publicos).
-- =====================================================================

begin;

drop function if exists public.buscar_entradas(text, uuid, uuid, uuid, text, date, date, text, integer, integer);
drop function if exists public.videos_publicos(integer);

-- Archivo por año y mes: vuelve a contar coberturas (definición de la migración 2)
create or replace function public.archivo_coberturas()
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

drop trigger if exists asegurar_dia on public.albumes;
drop trigger if exists limpiar_dia  on public.albumes;
drop function if exists private.asegurar_dia();
drop function if exists private.limpiar_dia();

drop table if exists public.dias_cobertura;   -- sus disparadores y políticas se van con ella
drop function if exists private.dia_fijo_y_novedad();
drop function if exists private.limpiar_dia_vacio();
drop function if exists private.dia_publico(uuid);

delete from private.migraciones where nombre = '20261117000100_dias_cobertura';

commit;
