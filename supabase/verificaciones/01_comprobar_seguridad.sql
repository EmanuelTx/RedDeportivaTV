-- =====================================================================
-- RedDeportivaTV · Comprobación de seguridad (NO deja cambios)
-- ---------------------------------------------------------------------
-- Ejecutar DESPUÉS de las migraciones 1 y 2, en el editor SQL de Supabase.
-- (Las coberturas tienen además su propia verificación: 02_comprobar_coberturas.sql.)
-- Crea datos de prueba, simula tres tipos de usuario y al final DESHACE
-- TODO (rollback): no quedan datos, usuarios ni archivos de prueba.
--
--   * Visitante anónimo         (rol anon, sin sesión)
--   * Usuario con sesión NO admin (rol authenticated, id inventado)
--   * Administrador autorizado  (uno real si ya existe; si no, uno de
--                                prueba que también se deshace)
--
-- Prueba noticias y álbumes publicados y en borrador, y fotos en el
-- bucket privado (fotos-borradores) y en el público (fotos-publicas).
--
-- ⚠ ALCANCE: estas pruebas verifican las REGLAS (RLS, permisos, estados).
--   Para eso simulan con INSERT/UPDATE sobre storage.objects lo que la
--   Storage API comprueba antes de subir o mover un archivo. NO suben ni
--   mueven archivos reales, no prueban URLs públicas ni cachés.
--   El panel NUNCA escribe storage.objects: usa supabase.storage.
--   Las pruebas con fotografías reales están en
--   pruebas/almacenamiento.html y son obligatorias antes de usar el panel.
--
-- Resultado: una tabla en la que TODAS las filas deben decir ok = true.
-- =====================================================================

begin;

create temp table resultados (n serial, prueba text, esperado text, obtenido text, ok boolean);
create temp table ctx (admin_id uuid, nota text);

-- ---------- Herramientas de prueba (temporales) ----------
-- Anota un resultado. Si se espera "bloqueado", vale cualquier bloqueo.
create function pg_temp.probar(p_prueba text, p_esperado text, p_obtenido text)
returns void language sql as $$
  insert into resultados (prueba, esperado, obtenido, ok)
  values (p_prueba, p_esperado, coalesce(p_obtenido, '(nada)'),
          case when p_esperado = 'bloqueado' then coalesce(p_obtenido like 'bloqueado%', false)
               else coalesce(p_obtenido = p_esperado, false) end);
$$;

-- Ejecuta una instrucción como otro rol y cuenta las filas afectadas.
create function pg_temp.como(p_rol text, p_claims text, p_sql text)
returns text language plpgsql as $$
declare
  v text;
  n bigint;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    v := case when n = 0 then 'bloqueado (0 filas)' else 'permitido (' || n || ' filas)' end;
  exception when others then
    v := 'bloqueado (' || sqlstate || ': ' || left(sqlerrm, 80) || ')';
  end;
  reset role;
  return v;
end;
$$;

-- Lee un valor como otro rol.
create function pg_temp.leer(p_rol text, p_claims text, p_sql text)
returns text language plpgsql as $$
declare
  v text;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', p_claims, true);
  execute format('set local role %I', p_rol);
  begin
    execute p_sql into v;
  exception when others then
    v := 'error (' || sqlstate || ': ' || left(sqlerrm, 80) || ')';
  end;
  reset role;
  return v;
end;
$$;

create function pg_temp.anon() returns text language sql as $$ select '{"role":"anon"}' $$;
create function pg_temp.usuario() returns text language sql as $$
  select '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}' $$;
create function pg_temp.admin() returns text language sql as $$
  select json_build_object('sub', (select admin_id from ctx limit 1), 'role', 'authenticated')::text $$;

-- =====================================================================
-- A) Estructura y permisos
-- =====================================================================
insert into resultados (prueba, esperado, obtenido, ok)
select 'RLS activado: ' || c.relname, 'true', c.relrowsecurity::text, c.relrowsecurity
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('administradores','campeonatos','categorias','partidos','noticias','albumes','fotos','transmisiones')
order by c.relname;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Bucket ' || id || ': ' || case when id = 'fotos-borradores' then 'PRIVADO' else 'público' end || ', 5 MB, JPG/PNG/WebP',
       case when id = 'fotos-borradores' then 'false' else 'true' end || ' / 5242880 / jpeg,png,webp',
       public::text || ' / ' || file_size_limit || ' / ' || array_to_string(allowed_mime_types, ','),
       public = (id = 'fotos-publicas') and file_size_limit = 5242880
         and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
from storage.buckets where id in ('fotos-borradores', 'fotos-publicas')
order by id;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Funciones SECURITY DEFINER (con search_path vacío)',
       'album_publicado, es_admin, ruta_publicada',
       string_agg(proname || case when proconfig @> array['search_path=""'] then '' else ' (SIN search_path)' end, ', ' order by proname),
       string_agg(proname, ', ' order by proname) = 'album_publicado, es_admin, ruta_publicada'
         and bool_and(coalesce(proconfig @> array['search_path=""'], false))
from pg_proc where pronamespace = 'private'::regnamespace and prosecdef;

insert into resultados (prueba, esperado, obtenido, ok)
select 'Todas las funciones privadas tienen search_path fijo', '0 sin fijar',
       count(*) filter (where not coalesce(proconfig @> array['search_path=""'], false)) || ' sin fijar',
       count(*) filter (where not coalesce(proconfig @> array['search_path=""'], false)) = 0
from pg_proc where pronamespace = 'private'::regnamespace;

insert into resultados (prueba, esperado, obtenido, ok)
select 'EXECUTE: el visitante solo puede usar', 'album_publicado, normalizar',
       coalesce(string_agg(proname, ', ' order by proname), '(ninguna)'),
       coalesce(string_agg(proname, ', ' order by proname), '') = 'album_publicado, normalizar'
from pg_proc where pronamespace = 'private'::regnamespace and has_function_privilege('anon', oid, 'EXECUTE');

insert into resultados (prueba, esperado, obtenido, ok)
select 'EXECUTE: un usuario con sesión solo puede usar', 'album_publicado, es_admin, normalizar, ruta_publicada, ruta_valida, texto_busqueda',
       coalesce(string_agg(proname, ', ' order by proname), '(ninguna)'),
       coalesce(string_agg(proname, ', ' order by proname), '') = 'album_publicado, es_admin, normalizar, ruta_publicada, ruta_valida, texto_busqueda'
from pg_proc where pronamespace = 'private'::regnamespace and has_function_privilege('authenticated', oid, 'EXECUTE');

with tablas(t) as (values ('administradores'),('campeonatos'),('categorias'),('partidos'),('noticias'),('albumes'),('fotos'),('transmisiones')),
     permisos as (
       select r.rol, t.t, p.priv
       from (values ('anon'),('authenticated')) r(rol), tablas t,
            (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
       where has_table_privilege(r.rol, 'public.' || t.t, p.priv))
insert into resultados (prueba, esperado, obtenido, ok)
select 'Sin permisos de API peligrosos (TRUNCATE, escribir admins, escribir como visitante)', '(ninguno)',
       coalesce(string_agg(rol || ':' || t || ':' || priv, ', '), '(ninguno)'),
       count(*) = 0
from permisos
where priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
   or rol = 'anon'
   or t = 'administradores';

-- =====================================================================
-- B) Datos de prueba (se deshacen al final)
-- =====================================================================
insert into public.campeonatos (id, nombre, slug, visible) values
  ('00000000-0000-0000-0000-0000000000c1', 'Prueba RLS visible', 'prueba-rls',        true),
  ('00000000-0000-0000-0000-0000000000c2', 'Prueba RLS oculto',  'prueba-rls-oculto', false);
insert into public.noticias (id, slug, titulo, estado) values
  ('00000000-0000-0000-0000-0000000000b1', 'prueba-rls-publicada', 'Noticia publicada', 'publicada'),
  ('00000000-0000-0000-0000-0000000000b2', 'prueba-rls-borrador',  'Noticia borrador',  'borrador');
-- (Desde la migración 2: publicar fotos exige cobertura visible y fotos "disponibles".)
insert into public.albumes (id, slug, titulo, estado, visible, estado_fotos) values
  ('00000000-0000-0000-0000-0000000000a1', 'prueba-rls-album-pub', 'Álbum publicado', 'publicada', true,  'disponible'),
  ('00000000-0000-0000-0000-0000000000a2', 'prueba-rls-album-bor', 'Álbum borrador',  'borrador',  false, 'pendiente');
insert into public.fotos (album_id, path) values
  ('00000000-0000-0000-0000-0000000000a1', 'albumes/00000000-0000-0000-0000-0000000000a1/pub.jpg'),
  ('00000000-0000-0000-0000-0000000000a2', 'albumes/00000000-0000-0000-0000-0000000000a2/bor.jpg');
insert into public.transmisiones (titulo, youtube_url, en_vivo, termina_en) values
  ('Prueba RLS vigente', 'https://www.youtube.com/watch?v=prueba1', true,  now() + interval '2 hours'),
  ('Prueba RLS vencida', 'https://www.youtube.com/watch?v=prueba2', true,  now() - interval '1 hour'),
  ('Prueba RLS apagada', 'https://www.youtube.com/watch?v=prueba3', false, null);

-- Administrador para las pruebas: uno real si existe; si no, uno temporal.
do $$
declare
  v uuid;
begin
  select user_id into v from public.administradores order by creado_en limit 1;
  if v is not null then
    insert into ctx values (v, 'administrador real');
  else
    begin
      insert into auth.users (id, aud, role, email)
        values ('00000000-0000-0000-0000-00000000ad01', 'authenticated', 'authenticated', 'admin-prueba-1@prueba.invalid');
      insert into public.administradores (user_id, nombre)
        values ('00000000-0000-0000-0000-00000000ad01', 'Admin de prueba');
      insert into ctx values ('00000000-0000-0000-0000-00000000ad01', 'administrador de prueba temporal');
    exception when others then
      insert into ctx values (null, 'no se pudo crear: ' || left(sqlerrm, 80));
    end;
  end if;
end;
$$;

select pg_temp.probar('Administrador para las pruebas', 'disponible',
  (select case when admin_id is null then nota else 'disponible' end from ctx));

-- =====================================================================
-- C) Administrador autorizado
-- =====================================================================
select pg_temp.probar('Admin: es reconocido como administrador', 'true',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select private.es_admin()::text$q$));
select pg_temp.probar('Admin: ve noticias publicadas y borradores', '2',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.noticias where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Admin: ve álbumes publicados y borradores', '2',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.albumes where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Admin: ve fotos de todos los álbumes', '2',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.fotos where album_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2')$q$));
select pg_temp.probar('Admin: ve todas las transmisiones', '3',
  pg_temp.leer('authenticated', pg_temp.admin(), $q$select count(*)::text from public.transmisiones where titulo like 'Prueba RLS%'$q$));

select pg_temp.probar('Admin: puede crear una noticia', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.noticias (slug, titulo) values ('prueba-rls-admin', 'Creada por admin')$q$));
select pg_temp.probar('Admin: puede editar una noticia', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.noticias set titulo = 'Editada' where slug = 'prueba-rls-admin'$q$));
select pg_temp.probar('Admin: puede borrar una noticia', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$delete from public.noticias where slug = 'prueba-rls-admin'$q$));

select pg_temp.probar('Admin: sube foto de álbum BORRADOR al bucket privado', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', 'albumes/00000000-0000-0000-0000-0000000000a2/bor.jpg')$q$));
select pg_temp.probar('Admin: sube foto de álbum PUBLICADO al bucket público', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000a1/pub.jpg')$q$));

select pg_temp.probar('Admin: NO puede poner foto de álbum borrador en el bucket público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000a2/otra.jpg')$q$));
select pg_temp.probar('Admin: NO puede poner portada de noticia borrador en el bucket público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'noticias/00000000-0000-0000-0000-0000000000b2/portada.jpg')$q$));
select pg_temp.probar('Admin: NO puede mover una foto de borrador al bucket público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores' and name = 'albumes/00000000-0000-0000-0000-0000000000a2/bor.jpg'$q$));
select pg_temp.probar('Admin: NO puede renombrar una foto pública hacia la carpeta de un borrador', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set name = 'albumes/00000000-0000-0000-0000-0000000000a2/pub.jpg' where bucket_id = 'fotos-publicas' and name = 'albumes/00000000-0000-0000-0000-0000000000a1/pub.jpg'$q$));
select pg_temp.probar('Admin: NO puede subir archivos fuera de las carpetas permitidas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', 'otra-carpeta/x.jpg')$q$));
select pg_temp.probar('Admin: NO puede volver público el bucket privado', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.buckets set public = true where id = 'fotos-borradores'$q$));
select pg_temp.probar('Admin: NO puede agregar administradores desde la web', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.administradores (user_id, nombre) values ('11111111-1111-1111-1111-111111111111', 'Intruso')$q$));
select pg_temp.probar('Admin: NO puede quitar administradores desde la web', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$delete from public.administradores$q$));
select pg_temp.probar('Admin: NO puede pasar a borrador un álbum con fotos públicas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'borrador' where id = '00000000-0000-0000-0000-0000000000a1'$q$));
select pg_temp.probar('Admin: NO puede borrar un álbum publicado con fotos públicas', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$delete from public.albumes where id = '00000000-0000-0000-0000-0000000000a1'$q$));
select pg_temp.probar('Admin: NO puede cambiar el id de un álbum', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set id = gen_random_uuid() where id = '00000000-0000-0000-0000-0000000000a2'$q$));
select pg_temp.probar('Base de datos: rechaza una foto guardada en la carpeta de otro álbum', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into public.fotos (album_id, path) values ('00000000-0000-0000-0000-0000000000a1', 'albumes/00000000-0000-0000-0000-0000000000a2/x.jpg')$q$));

-- =====================================================================
-- D) Visitante anónimo
-- =====================================================================
select pg_temp.probar('Visitante: ve solo noticias publicadas', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.noticias where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Visitante: NO puede abrir una noticia borrador aunque sepa su dirección', '0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.noticias where slug = 'prueba-rls-borrador'$q$));
select pg_temp.probar('Visitante: ve solo álbumes publicados', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.albumes where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Visitante: ve solo fotos de álbumes publicados', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.fotos where album_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2')$q$));
select pg_temp.probar('Visitante: ve solo la transmisión EN VIVO vigente', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.transmisiones where titulo like 'Prueba RLS%'$q$));
select pg_temp.probar('Visitante: ve solo campeonatos visibles', '1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select count(*)::text from public.campeonatos where slug like 'prueba-rls%'$q$));

select pg_temp.probar('Visitante: NO puede crear noticias', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$insert into public.noticias (slug, titulo) values ('prueba-rls-intruso', 'x')$q$));
select pg_temp.probar('Visitante: NO puede editar noticias', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$update public.noticias set titulo = 'hackeado' where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Visitante: NO puede borrar campeonatos', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$delete from public.campeonatos where slug like 'prueba-rls%'$q$));
select pg_temp.probar('Visitante: NO ve columnas internas (creado_por, estado)', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select creado_por, estado from public.noticias$q$));
select pg_temp.probar('Visitante: NO ve la lista de administradores', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select * from public.administradores$q$));
select pg_temp.probar('Visitante: NO puede listar fotos de ningún bucket', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select name from storage.objects where bucket_id in ('fotos-borradores', 'fotos-publicas')$q$));
select pg_temp.probar('Visitante: NO puede subir fotos', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000a1/intruso.jpg')$q$));
select pg_temp.probar('Visitante: NO puede usar la función es_admin', 'bloqueado',
  pg_temp.como('anon', pg_temp.anon(), $q$select private.es_admin()$q$));

-- =====================================================================
-- E) Usuario con sesión que NO es administrador
-- =====================================================================
select pg_temp.probar('Usuario no admin: no es reconocido como administrador', 'false',
  pg_temp.leer('authenticated', pg_temp.usuario(), $q$select private.es_admin()::text$q$));
select pg_temp.probar('Usuario no admin: NO ve noticias borrador', '1',
  pg_temp.leer('authenticated', pg_temp.usuario(), $q$select count(*)::text from public.noticias where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Usuario no admin: NO ve álbumes borrador', '1',
  pg_temp.leer('authenticated', pg_temp.usuario(), $q$select count(*)::text from public.albumes where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Usuario no admin: NO ve fotos de álbumes borrador', '1',
  pg_temp.leer('authenticated', pg_temp.usuario(), $q$select count(*)::text from public.fotos where album_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2')$q$));

select pg_temp.probar('Usuario no admin: NO puede crear noticias', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.noticias (slug, titulo) values ('prueba-rls-intruso-2', 'x')$q$));
select pg_temp.probar('Usuario no admin: NO puede crear álbumes', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.albumes (slug, titulo) values ('prueba-rls-intruso-3', 'x')$q$));
select pg_temp.probar('Usuario no admin: NO puede agregar fotos a un álbum', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.fotos (album_id, path) values ('00000000-0000-0000-0000-0000000000a1', 'albumes/00000000-0000-0000-0000-0000000000a1/intruso.jpg')$q$));
select pg_temp.probar('Usuario no admin: NO puede crear campeonatos', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.campeonatos (nombre, slug) values ('x', 'prueba-rls-intruso')$q$));
select pg_temp.probar('Usuario no admin: NO puede crear transmisiones', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.transmisiones (titulo, youtube_url) values ('x', 'https://www.youtube.com/watch?v=x')$q$));
select pg_temp.probar('Usuario no admin: NO puede editar noticias', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.noticias set titulo = 'hackeado' where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Usuario no admin: NO puede publicar un borrador', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.albumes set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000000a2'$q$));
select pg_temp.probar('Usuario no admin: NO puede borrar álbumes', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$delete from public.albumes where slug like 'prueba-rls-%'$q$));
select pg_temp.probar('Usuario no admin: NO puede apagar o cambiar transmisiones', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update public.transmisiones set en_vivo = false where titulo like 'Prueba RLS%'$q$));
select pg_temp.probar('Usuario no admin: NO puede hacerse administrador', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into public.administradores (user_id, nombre) values ('11111111-1111-1111-1111-111111111111', 'Yo')$q$));
select pg_temp.probar('Usuario no admin: NO ve la lista de administradores', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$select * from public.administradores$q$));
select pg_temp.probar('Usuario no admin: NO puede listar fotos (privadas ni públicas)', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$select name from storage.objects where bucket_id in ('fotos-borradores', 'fotos-publicas')$q$));
select pg_temp.probar('Usuario no admin: NO puede subir al bucket privado', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into storage.objects (bucket_id, name) values ('fotos-borradores', 'albumes/00000000-0000-0000-0000-0000000000a2/intruso.jpg')$q$));
select pg_temp.probar('Usuario no admin: NO puede subir al bucket público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000a1/intruso.jpg')$q$));
select pg_temp.probar('Usuario no admin: NO puede mover ni renombrar fotos', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores'$q$));
select pg_temp.probar('Usuario no admin: NO puede borrar fotos', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$delete from storage.objects where bucket_id in ('fotos-borradores', 'fotos-publicas')$q$));
select pg_temp.probar('Usuario no admin: NO puede crear buckets', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.usuario(), $q$insert into storage.buckets (id, name, public) values ('prueba-intruso', 'prueba-intruso', true)$q$));

-- =====================================================================
-- F) Estados de publicación y límite de administradores
--    Los UPDATE de storage.objects simulan la comprobación de permisos
--    que hace supabase.storage.move(..., { destinationBucket }).
-- =====================================================================
-- Publicar el álbum borrador (a2), que tiene su foto en el bucket privado
select pg_temp.probar('Admin: NO puede pasar directo a "publicada" con fotos en el privado', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicada', visible = true, estado_fotos = 'disponible' where id = '00000000-0000-0000-0000-0000000000a2'$q$));
select pg_temp.probar('Admin: marca el álbum como "publicando"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicando', visible = true, estado_fotos = 'disponible' where id = '00000000-0000-0000-0000-0000000000a2'$q$));
select pg_temp.probar('Visitante: NO ve un álbum "publicando" ni sus fotos', '0 / 0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select (select count(*) from public.albumes where id = '00000000-0000-0000-0000-0000000000a2') || ' / ' || (select count(*) from public.fotos where album_id = '00000000-0000-0000-0000-0000000000a2')$q$));
select pg_temp.probar('Admin (permiso de move): pasa la foto al público mientras publica', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-publicas' where bucket_id = 'fotos-borradores' and name = 'albumes/00000000-0000-0000-0000-0000000000a2/bor.jpg'$q$));
select pg_temp.probar('Admin: con todas las fotos en el público, marca "publicada"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'publicada' where id = '00000000-0000-0000-0000-0000000000a2'$q$));
select pg_temp.probar('Visitante: ahora sí ve ese álbum y su foto', '1 / 1',
  pg_temp.leer('anon', pg_temp.anon(), $q$select (select count(*) from public.albumes where id = '00000000-0000-0000-0000-0000000000a2') || ' / ' || (select count(*) from public.fotos where album_id = '00000000-0000-0000-0000-0000000000a2')$q$));

-- Despublicar el álbum publicado (a1), que tiene su foto en el bucket público
select pg_temp.probar('Admin: marca el álbum como "despublicando"', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'despublicando' where id = '00000000-0000-0000-0000-0000000000a1'$q$));
select pg_temp.probar('Visitante: deja de ver el álbum en cuanto está "despublicando"', '0 / 0',
  pg_temp.leer('anon', pg_temp.anon(), $q$select (select count(*) from public.albumes where id = '00000000-0000-0000-0000-0000000000a1') || ' / ' || (select count(*) from public.fotos where album_id = '00000000-0000-0000-0000-0000000000a1')$q$));
select pg_temp.probar('Admin: NO puede cerrar como "borrador" con una foto todavía en el público', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'borrador' where id = '00000000-0000-0000-0000-0000000000a1'$q$));
select pg_temp.probar('Admin: NO puede subir fotos nuevas al público mientras despublica', 'bloqueado',
  pg_temp.como('authenticated', pg_temp.admin(), $q$insert into storage.objects (bucket_id, name) values ('fotos-publicas', 'albumes/00000000-0000-0000-0000-0000000000a1/nueva.jpg')$q$));
select pg_temp.probar('Admin (permiso de move): devuelve la foto al bucket privado', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update storage.objects set bucket_id = 'fotos-borradores' where bucket_id = 'fotos-publicas' and name = 'albumes/00000000-0000-0000-0000-0000000000a1/pub.jpg'$q$));
select pg_temp.probar('Admin: después sí puede pasar el álbum a borrador', 'permitido (1 filas)',
  pg_temp.como('authenticated', pg_temp.admin(), $q$update public.albumes set estado = 'borrador' where id = '00000000-0000-0000-0000-0000000000a1'$q$));

do $$
declare
  c int;
  i int := 0;
  r text;
begin
  begin
    select count(*) into c from public.administradores;
    while c < 2 loop
      i := i + 1;
      insert into auth.users (id, aud, role, email)
        values (('00000000-0000-0000-0000-00000000ae0' || i)::uuid, 'authenticated', 'authenticated', 'admin-extra-' || i || '@prueba.invalid');
      insert into public.administradores (user_id, nombre)
        values (('00000000-0000-0000-0000-00000000ae0' || i)::uuid, 'Admin extra ' || i);
      c := c + 1;
    end loop;
    insert into auth.users (id, aud, role, email)
      values ('00000000-0000-0000-0000-00000000ae09', 'authenticated', 'authenticated', 'admin-tercero@prueba.invalid');
  exception when others then
    r := 'no se pudo preparar: ' || left(sqlerrm, 80);
  end;

  if r is null then
    begin
      insert into public.administradores (user_id, nombre)
        values ('00000000-0000-0000-0000-00000000ae09', 'Tercero');
      r := 'lo permitió';
    exception when others then
      r := 'bloqueado (' || left(sqlerrm, 80) || ')';
    end;
  end if;

  insert into resultados (prueba, esperado, obtenido, ok)
  values ('Máximo 2 administradores: un tercero es rechazado', 'bloqueado (como máximo 2)', r,
          coalesce(r like '%como máximo 2%', false));
end;
$$;

-- Registro privado de migraciones: nadie de afuera lo lee ni lo cambia
insert into resultados (prueba, esperado, obtenido, ok)
select 'Registro de migraciones: sin acceso para visitantes ni usuarios', '(ninguno)',
       coalesce(string_agg(r || ':' || p, ', ') filter (where has_table_privilege(r, 'private.migraciones', p)), '(ninguno)'),
       not bool_or(has_table_privilege(r, 'private.migraciones', p))
from unnest(array['anon', 'authenticated']) r, unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p;

-- =====================================================================
-- Resultado: primera fila = RESUMEN con el total real; después, las que fallaron
-- =====================================================================
select n, ok, prueba, esperado, obtenido from (
  select 0 as n, coalesce(bool_and(ok), false) as ok,
         'RESUMEN: ' || count(*) filter (where ok) || ' de ' || count(*) || ' pruebas ok' as prueba,
         count(*)::text as esperado, (count(*) filter (where ok))::text as obtenido
  from resultados
  union all
  select n, ok, prueba, esperado, obtenido from resultados) x
order by (n = 0) desc, ok, n;

rollback;  -- deshace TODO: datos, usuarios y registros de prueba
