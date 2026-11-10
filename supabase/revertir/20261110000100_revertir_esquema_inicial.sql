-- =====================================================================
-- RedDeportivaTV · REVERTIR la migración 1 (solo en caso necesario)
-- ---------------------------------------------------------------------
-- ⚠ BORRA las tablas y TODO su contenido. Usar solo si la migración
-- quedó mal y todavía no hay contenido real cargado.
-- El bucket "fotos" solo se borra si está vacío.
-- =====================================================================

begin;

drop policy if exists "Admins listan fotos"     on storage.objects;
drop policy if exists "Admins suben fotos"      on storage.objects;
drop policy if exists "Admins reemplazan fotos" on storage.objects;
drop policy if exists "Admins borran fotos"     on storage.objects;
delete from storage.buckets
  where id = 'fotos' and not exists (select 1 from storage.objects where bucket_id = 'fotos');

drop table if exists public.fotos           cascade;
drop table if exists public.transmisiones   cascade;
drop table if exists public.noticias        cascade;
drop table if exists public.albumes         cascade;
drop table if exists public.partidos        cascade;
drop table if exists public.categorias      cascade;
drop table if exists public.campeonatos     cascade;
drop table if exists public.administradores cascade;

drop function if exists private.album_publicado(uuid);
drop function if exists private.marcar_publicacion();
drop function if exists private.tocar_actualizado();
drop function if exists private.es_admin();
drop function if exists private.limitar_administradores();
drop schema if exists private;

commit;
