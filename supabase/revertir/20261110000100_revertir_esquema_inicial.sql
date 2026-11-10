-- =====================================================================
-- RedDeportivaTV · REVERTIR la migración 1 (solo en caso necesario)
-- ---------------------------------------------------------------------
-- ⚠ BORRA las tablas y TODO su contenido. Usar solo si la migración
-- quedó mal y todavía no hay contenido real cargado.
--
-- Los buckets "fotos-borradores" y "fotos-publicas" NO se borran desde
-- acá (Supabase no permite borrar almacenamiento con SQL): si hace falta,
-- vaciarlos y borrarlos en Storage desde el panel de Supabase.
-- =====================================================================

begin;

drop policy if exists "Admins ven fotos privadas"     on storage.objects;
drop policy if exists "Admins suben fotos privadas"   on storage.objects;
drop policy if exists "Admins cambian fotos privadas" on storage.objects;
drop policy if exists "Admins borran fotos privadas"  on storage.objects;
drop policy if exists "Admins listan fotos publicas"  on storage.objects;
drop policy if exists "Admins publican fotos"         on storage.objects;
drop policy if exists "Admins cambian fotos publicas" on storage.objects;
drop policy if exists "Admins retiran fotos publicas" on storage.objects;

drop table if exists public.fotos           cascade;
drop table if exists public.transmisiones   cascade;
drop table if exists public.noticias        cascade;
drop table if exists public.albumes         cascade;
drop table if exists public.partidos        cascade;
drop table if exists public.categorias      cascade;
drop table if exists public.campeonatos     cascade;
drop table if exists public.administradores cascade;

drop function if exists private.proteger_fotos_publicas();
drop function if exists private.ruta_publicada(text);
drop function if exists private.album_publicado(uuid);
drop function if exists private.ruta_valida(text);
drop function if exists private.marcar_publicacion();
drop function if exists private.tocar_actualizado();
drop function if exists private.es_admin();
drop function if exists private.limitar_administradores();
drop schema if exists private;

commit;
